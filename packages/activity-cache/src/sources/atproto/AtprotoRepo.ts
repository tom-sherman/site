import { MemoryBlockstore, readCarWithRoot, Repo } from "@atproto/repo";
import { com } from "@repo/atproto-client";
import { xrpc, type XrpcError } from "@repo/atproto-client/effect";
import { Duration, Effect, Schedule } from "effect";
import { HttpClient } from "effect/http";
import type { Activity } from "../../Activity.ts";
import { type Source, SourceError, SnapshotResult } from "../../Source.ts";
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
 * Until realtime ingestion exists this is what keeps atproto data fresh,
 * hence 5 minutes. Once Jetstream is consuming the repo, freshness comes from
 * the stream and this becomes a consistency check, catching what a persisted
 * cursor can't: downtime longer than Jetstream's replay window, consumer bugs,
 * and the repo being rewritten (e.g. a PDS migration). Then it can be an hour
 * or more. For that to stay cheap, applying Jetstream commits must also
 * advance the stored checkpoint to the commit's `rev`; otherwise every check
 * sees a newer revision than the last snapshot and downloads the whole repo.
 *
 * Deliberately not configurable: nothing about a deployment should change it.
 * Returned as each snapshot's `refreshAfter`; the cache does the scheduling.
 */
const REFRESH_INTERVAL = Duration.minutes(5);

/**
 * Snapshots from a full repo export (~6MB and about a second for ~12k
 * records). The checkpoint is the repo revision, so a refresh where nothing
 * changed costs one `getLatestCommit` call instead.
 */
export const makeAtprotoRepoSource = Effect.fn("makeAtprotoRepoSource")(
  function* (options: {
    readonly did: string;
    readonly collections: ReadonlyArray<CollectionHandler>;
  }) {
    const client = yield* HttpClient.HttpClient;
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
    } satisfies Source;
  },
);
