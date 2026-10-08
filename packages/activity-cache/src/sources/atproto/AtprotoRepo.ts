import { MemoryBlockstore, readCarWithRoot, Repo } from "@atproto/repo";
import { com } from "@repo/atproto-client";
import { xrpc, type XrpcError } from "@repo/atproto-client/effect";
import { Clock, Duration, Effect, Schedule, Stream } from "effect";
import { HttpClient } from "effect/http";
import { type Activity, Mutation, RETENTION_MS } from "../../Activity.ts";
import {
  Jetstream,
  type JetstreamError,
  type JetstreamEvent,
  timestampCursor,
} from "../../jetstream/Jetstream.ts";
import {
  Change,
  CursorStore,
  type Source,
  SourceError,
  SnapshotResult,
} from "../../Source.ts";
import type { CollectionHandler } from "./collections.ts";
import { resolvePds } from "./identity.ts";

interface RepoRecord {
  readonly collection: string;
  readonly rkey: string;
  readonly value: unknown;
}

type Did = `did:${string}:${string}`;

/** Rate-limited responses carry a `retryAt`; retrying those here would only make it worse. */
const retryTransient = <A, R>(self: Effect.Effect<A, XrpcError, R>) =>
  Effect.retry(self, {
    while: (error) => error.retryable && error.retryAt === undefined,
    schedule: Schedule.exponential("500 millis"),
    times: 3,
  });

/** The repo's current revision: a tiny request, versus megabytes for the repo. */
const latestRev = Effect.fn("latestRev")(function* (pds: string, did: Did) {
  const response = yield* xrpc(pds, com.atproto.sync.getLatestCommit, {
    params: { did },
  }).pipe(retryTransient);
  return response.body.rev;
});

/** Downloads the whole repo with `com.atproto.sync.getRepo`. */
const fetchRepo = Effect.fn("fetchRepo")(function* (pds: string, did: Did) {
  const response = yield* xrpc(pds, com.atproto.sync.getRepo, {
    params: { did },
  }).pipe(retryTransient);
  return yield* Effect.promise(async () => {
    const car = await readCarWithRoot(response.body);
    return Repo.load(new MemoryBlockstore(car.blocks), car.root);
  });
});

/** Every record in `collections`, using the MST's key order to skip the rest. */
const readCollections = (repo: Repo, collections: ReadonlyArray<string>) =>
  Effect.promise(async () => {
    const records: Array<RepoRecord> = [];
    for (const collection of collections) {
      for await (const record of repo.walkRecords(`${collection}/`)) {
        if (record.collection !== collection) break;
        records.push({ ...record, value: record.record });
      }
    }
    return records;
  });

/**
 * How often to check the repo for changes. Each check is one `getLatestCommit`
 * call; the export is only downloaded when the revision has moved on.
 *
 * Freshness comes from Jetstream (`changes`), so this is a consistency check
 * for what the stream can't see, like consumer bugs. It stays cheap because
 * every commit on the stream advances the checkpoint to its `rev`, so a check
 * normally finds the repo where the stream left it. Gaps the stream can see
 * (a cursor older than Jetstream keeps, a repo reset) trigger a rebuild
 * straight away instead of waiting for this.
 *
 * Deliberately not configurable: nothing about a deployment should change it.
 * Returned as each snapshot's `refreshAfter`; the cache does the scheduling.
 */
const REFRESH_INTERVAL = Duration.hours(1);

/**
 * How far before "now" a stream (re)started from a timestamp begins, so the
 * Jetstream server's clock running behind ours can't open a gap. Replaying a
 * minute twice is harmless: upserts and deletes are idempotent.
 */
const CLOCK_SKEW = Duration.minutes(1);

/**
 * Snapshots from a full repo export (~6MB and about a second for ~12k
 * records). The checkpoint is the repo revision, so a refresh where nothing
 * changed costs one `getLatestCommit` call instead.
 *
 * Realtime changes come from Jetstream, mapped by the same collection
 * handlers, so the stream and snapshots always agree.
 */
export const makeAtprotoRepoSource = Effect.fn("makeAtprotoRepoSource")(
  function* (options: {
    readonly did: string;
    readonly collections: ReadonlyArray<CollectionHandler>;
  }) {
    const client = yield* HttpClient.HttpClient;
    const jetstream = yield* Jetstream;
    const did = options.did as Did;
    const handlers = new Map(options.collections.map((h) => [h.collection, h]));

    const snapshot = ({
      since,
      checkpoint,
    }: {
      readonly since: number;
      readonly checkpoint: string | undefined;
    }) =>
      Effect.gen(function* () {
        const pds = yield* resolvePds(did);
        if (
          checkpoint !== undefined &&
          (yield* latestRev(pds, did)) === checkpoint
        ) {
          return SnapshotResult.unchanged(REFRESH_INTERVAL);
        }
        const repo = yield* fetchRepo(pds, did);
        yield* Effect.logInfo("Fetched repo").pipe(
          Effect.annotateLogs({ rev: repo.commit.rev }),
        );
        const records = yield* readCollections(repo, [...handlers.keys()]);
        const activities = yield* Effect.forEach(records, (record) =>
          handlers.get(record.collection)!.toActivity({
            uri: `at://${did}/${record.collection}/${record.rkey}`,
            rkey: record.rkey,
            value: record.value,
          }),
        );
        return SnapshotResult.snapshot(
          activities.filter(
            (a): a is Activity => a !== undefined && a.timestamp >= since,
          ),
          repo.commit.rev,
          REFRESH_INTERVAL,
        );
      }).pipe(
        Effect.mapError(
          (cause) =>
            new SourceError({
              source: "atproto",
              message: cause.message,
              retryAt: "retryAt" in cause ? cause.retryAt : undefined,
              cause,
            }),
        ),
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.withSpan("AtprotoRepo.snapshot"),
      );

    /** One record's commit, mapped with the same handler snapshots use. */
    const commitMutation = (
      commit: Extract<JetstreamEvent, { kind: "commit" }>["commit"],
    ) =>
      Effect.gen(function* () {
        const handler = handlers.get(commit.collection);
        if (!handler) return undefined;
        const uri = `at://${did}/${commit.collection}/${commit.rkey}`;
        if (commit.operation === "delete") return Mutation.delete(uri);
        // A record that's no longer activity (or never converted) must not
        // leave an earlier version of itself behind.
        const activity =
          commit.record === undefined
            ? undefined
            : yield* handler.toActivity({
                uri,
                rkey: commit.rkey,
                value: commit.record,
              });
        const since = (yield* Clock.currentTimeMillis) - RETENTION_MS;
        return activity && activity.timestamp >= since
          ? Mutation.upsert(activity)
          : Mutation.delete(uri);
      });

    const toChange = (event: JetstreamEvent) =>
      Effect.gen(function* () {
        switch (event.kind) {
          case "info":
            if (event.name === "OutdatedCursor") return Change.gap();
            yield* Effect.logInfo(`Jetstream: ${event.name}`, event.message);
            return undefined;
          case "commit": {
            if (event.did !== did) return undefined;
            const mutation = yield* commitMutation(event.commit);
            // Every commit moves the checkpoint on, including ones to
            // collections that aren't cached, or hourly checks would always
            // see a newer rev and download the repo.
            return Change.batch(mutation ? [mutation] : [], event.commit.rev);
          }
          case "sync":
            // The repo was reset (e.g. a PDS migration), so its commits no
            // longer describe how it got to where it is.
            return event.did === did ? Change.gap() : undefined;
          case "identity":
          case "account":
            return undefined;
        }
      });

    /**
     * Follows Jetstream, filtered to this DID server-side. The cursor is the
     * last event's seq, or a timestamp cursor until the first event after
     * starting over arrives. Each is saved only after `apply` succeeds for
     * its event, so nothing is skipped if this stops in between.
     */
    const follow = (apply: (change: Change) => Effect.Effect<void>) =>
      Effect.gen(function* () {
        const cursors = yield* CursorStore;

        /** Announces what's been missed, then resumes from just before now. */
        const startOver = Effect.gen(function* () {
          yield* apply(Change.gap());
          const now = yield* Clock.currentTimeMillis;
          const cursor = timestampCursor(now - Duration.toMillis(CLOCK_SKEW));
          yield* cursors.save(String(cursor));
          return cursor;
        });

        const followFrom = (
          cursor: number,
        ): Effect.Effect<void, JetstreamError> =>
          jetstream.subscribe({ dids: [did], cursor }).pipe(
            Stream.runForEach((event) =>
              Effect.gen(function* () {
                const change = yield* toChange(event);
                if (change) yield* apply(change);
                if (event.kind !== "info") {
                  yield* cursors.save(String(event.seq));
                }
              }),
            ),
            Effect.catchTag("CursorTooOld", (error) =>
              Effect.logWarning(error.message).pipe(
                Effect.andThen(startOver),
                Effect.flatMap(followFrom),
              ),
            ),
          );

        const saved = Number(yield* cursors.load);
        yield* followFrom(
          Number.isSafeInteger(saved) ? saved : yield* startOver,
        );
      }).pipe(
        Effect.mapError(
          (cause) =>
            new SourceError({
              source: "atproto",
              message: cause.message,
              cause,
            }),
        ),
        Effect.withSpan("AtprotoRepo.follow"),
      );

    return {
      name: "atproto",
      fingerprint: [
        `did=${did}`,
        `collections=${options.collections
          .map((h) => `${h.collection}@${h.version}`)
          .sort()
          .join(",")}`,
      ].join(";"),
      snapshot,
      follow,
    } satisfies Source;
  },
);
