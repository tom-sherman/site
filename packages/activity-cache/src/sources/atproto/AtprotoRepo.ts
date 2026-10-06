import { MemoryBlockstore, readCarWithRoot, Repo } from "@atproto/repo";
import { com } from "@repo/atproto-client";
import { xrpc } from "@repo/atproto-client/effect";
import { Effect, Schedule, Stream } from "effect";
import { HttpClient } from "effect/http";
import type { Activity } from "../../Activity.ts";
import { type Source, SourceError } from "../../Source.ts";
import type { CollectionHandler } from "./collections.ts";
import { resolvePds } from "./identity.ts";

interface RepoRecord {
  readonly collection: string;
  readonly rkey: string;
  readonly value: unknown;
}

/** Downloads the whole repo with `com.atproto.sync.getRepo`. */
const fetchRepo = Effect.fn("fetchRepo")(function* (did: string) {
  const pds = yield* resolvePds(did);
  const response = yield* xrpc(pds, com.atproto.sync.getRepo, {
    params: { did: did as `did:${string}:${string}` },
  }).pipe(
    Effect.retry({
      while: (error) => error.retryable,
      schedule: Schedule.exponential("500 millis"),
      times: 3,
    }),
  );
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
 * Backfills from a full repo export. Cheap enough to run on every rebuild:
 * ~6MB and about a second for a repo with ~12k records.
 */
export const makeAtprotoRepoSource = Effect.fn("makeAtprotoRepoSource")(
  function* (options: {
    readonly did: string;
    readonly collections: ReadonlyArray<CollectionHandler>;
  }) {
    const client = yield* HttpClient.HttpClient;
    const handlers = new Map(options.collections.map((h) => [h.collection, h]));

    const backfill = (since: number) =>
      Effect.gen(function* () {
        const repo = yield* fetchRepo(options.did);
        yield* Effect.logInfo("Fetched repo").pipe(
          Effect.annotateLogs({ did: repo.did, rev: repo.commit.rev }),
        );
        const records = yield* readCollections(repo, [...handlers.keys()]);
        const activities = yield* Effect.forEach(records, (record) =>
          handlers.get(record.collection)!.toActivity({
            uri: `at://${repo.did}/${record.collection}/${record.rkey}`,
            rkey: record.rkey,
            value: record.value,
          }),
        );
        return activities.filter(
          (a): a is Activity => a !== undefined && a.timestamp >= since,
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
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.withSpan("AtprotoRepo.backfill"),
        Stream.fromIterableEffect,
      );

    return { name: "atproto", backfill } satisfies Source;
  },
);
