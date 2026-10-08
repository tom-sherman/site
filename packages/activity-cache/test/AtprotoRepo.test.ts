import { Secp256k1Keypair } from "@atproto/crypto";
import {
  concatBytesAsync,
  getFullRepo,
  MemoryBlockstore,
  type RecordCreateOp,
  Repo,
  WriteOpAction,
} from "@atproto/repo";
import { assert, describe, it } from "@effect/vitest";
import { Effect, Exit, Layer, Stream } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { TestClock } from "effect/testing";
import { Mutation } from "../src/Activity.ts";
import {
  CursorTooOld,
  Jetstream,
  JetstreamError,
  type JetstreamEvent,
  type SubscribeOptions,
} from "../src/jetstream/Jetstream.ts";
import { Change } from "../src/Source.ts";
import { makeAtprotoRepoSource } from "../src/sources/atproto/AtprotoRepo.ts";
import { collections } from "../src/sources/atproto/collections.ts";

const DID = "did:plc:testtesttesttesttesttest";
const PDS = "https://pds.example";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-06T12:00:00Z");

type Write = Omit<RecordCreateOp, "action">;

const buildCar = async (writes: ReadonlyArray<Write> = defaultWrites) => {
  const storage = new MemoryBlockstore();
  const repo = await Repo.create(
    storage,
    DID,
    await Secp256k1Keypair.create(),
    writes.map((write) => ({ action: WriteOpAction.Create, ...write })),
  );
  const car = await concatBytesAsync(getFullRepo(storage, repo.cid));
  return { car, rev: repo.commit.rev, cid: repo.cid.toString() };
};

const defaultWrites: ReadonlyArray<Write> = [
  {
    collection: "app.bsky.feed.post",
    rkey: "3mxafgjedwc2y",
    record: {
      $type: "app.bsky.feed.post",
      text: "recent",
      createdAt: new Date(NOW - DAY).toISOString(),
    },
  },
  {
    collection: "app.bsky.feed.post",
    rkey: "3jzfcijpj2z2a",
    record: {
      $type: "app.bsky.feed.post",
      text: "too old",
      createdAt: new Date(NOW - 60 * DAY).toISOString(),
    },
  },
  {
    // Missing the required `createdAt`, so it doesn't parse and is skipped.
    collection: "app.bsky.feed.post",
    rkey: "3mxafgjedwc3a",
    record: { $type: "app.bsky.feed.post", text: "invalid" },
  },
  {
    // No `playedTime`: falls back to the TID's timestamp.
    collection: "fm.teal.feed.play",
    rkey: "3mxafgjedwc2z",
    record: { $type: "fm.teal.feed.play", trackName: "Acolyte" },
  },
  {
    // Not a cached collection.
    collection: "app.bsky.feed.like",
    rkey: "3mxafgjedwc2a",
    record: {
      $type: "app.bsky.feed.like",
      subject: { uri: "at://x", cid: "y" },
      createdAt: new Date(NOW).toISOString(),
    },
  },
];

interface Network {
  getRepo: () => Promise<Response>;
  getLatestCommit: () => Promise<Response>;
  calls: Array<string>;
}

/** Serves a DID document plus the sync endpoints for `DID`, recording which were called. */
const mockNetwork = (network: Network) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.promise(async () => {
        if (url.href === `https://plc.directory/${DID}`) {
          return Response.json({
            id: DID,
            service: [
              {
                id: "#atproto_pds",
                type: "AtprotoPersonalDataServer",
                serviceEndpoint: PDS,
              },
            ],
          });
        }
        for (const method of ["getRepo", "getLatestCommit"] as const) {
          if (url.href.startsWith(`${PDS}/xrpc/com.atproto.sync.${method}?`)) {
            assert.strictEqual(url.searchParams.get("did"), DID);
            network.calls.push(method);
            return network[method]();
          }
        }
        return new Response(null, { status: 404 });
      }).pipe(
        Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
      ),
    ),
  );

const serveCar = (car: Uint8Array) => async () =>
  new Response(car, {
    headers: { "content-type": "application/vnd.ipld.car" },
  });

const network = (overrides: Partial<Network>): Network => ({
  getRepo: async () => new Response(null, { status: 500 }),
  getLatestCommit: async () => new Response(null, { status: 500 }),
  calls: [],
  ...overrides,
});

/** Jetstream answering each subscription from `respond`, recording the options. */
const fakeJetstream = (
  respond: (
    options: SubscribeOptions,
  ) => Stream.Stream<JetstreamEvent, JetstreamError | CursorTooOld> = () =>
    Stream.empty,
) => {
  const subscriptions: Array<SubscribeOptions> = [];
  const layer = Layer.succeed(
    Jetstream,
    Jetstream.of({
      subscribe: (options) =>
        Stream.suspend(() => {
          subscriptions.push(options);
          return respond(options);
        }),
    }),
  );
  return { subscriptions, layer };
};

const makeSource = makeAtprotoRepoSource({ did: DID, collections }).pipe(
  Effect.provide(fakeJetstream().layer),
);

const snapshot = (options: { since: number; checkpoint?: string }) =>
  Effect.gen(function* () {
    const source = yield* makeSource;
    return yield* source.snapshot({
      since: options.since,
      checkpoint: options.checkpoint,
    });
  });

const sourceError = <A, E>(exit: Exit.Exit<A, E>) => {
  const reason = Exit.isFailure(exit) ? exit.cause.reasons[0] : undefined;
  return reason?._tag === "Fail" ? reason.error : undefined;
};

describe("AtprotoRepo", () => {
  it.effect("maps cached collections from a full repo export", () =>
    Effect.gen(function* () {
      const { car, rev } = yield* Effect.promise(() => buildCar());
      const net = network({ getRepo: serveCar(car) });
      const result = yield* snapshot({ since: NOW - 30 * DAY }).pipe(
        Effect.provide(mockNetwork(net)),
      );
      assert.strictEqual(result._tag, "Snapshot");
      if (result._tag !== "Snapshot") return;
      // No checkpoint yet, so straight to the full export.
      assert.deepStrictEqual(net.calls, ["getRepo"]);
      assert.strictEqual(result.checkpoint, rev);

      const byId = new Map(result.activities.map((a) => [a.id, a]));
      assert.deepStrictEqual([...byId.keys()].sort(), [
        `at://${DID}/app.bsky.feed.post/3mxafgjedwc2y`,
        `at://${DID}/fm.teal.feed.play/3mxafgjedwc2z`,
      ]);

      const post = byId.get(`at://${DID}/app.bsky.feed.post/3mxafgjedwc2y`)!;
      assert.strictEqual(post.type, "app.bsky.feed.post");
      assert.strictEqual(post.timestamp, NOW - DAY);
      assert.deepInclude(post.data as object, { text: "recent" });

      const play = byId.get(`at://${DID}/fm.teal.feed.play/3mxafgjedwc2z`)!;
      // 3mxafgjedwc2z is a TID from 2026-10-06.
      assert.strictEqual(
        new Date(play.timestamp).toISOString().slice(0, 10),
        "2026-10-06",
      );
    }),
  );

  it.effect("groups self-threads and collects them with thread records", () =>
    Effect.gen(function* () {
      const OTHER = "did:plc:someoneelsesomeoneelse0";
      const CID = "bafyreia7rgxu7467phwpcgzaw62l5bzmxufkpikrc5zm4q3xhjmuhq4pti";
      const mine = (rkey: string) => `at://${DID}/app.bsky.feed.post/${rkey}`;
      const theirs = `at://${OTHER}/app.bsky.feed.post/3mxafgjedwa2a`;
      const post = (
        rkey: string,
        reply?: { root: string; parent: string },
      ): Write => ({
        collection: "app.bsky.feed.post",
        rkey,
        record: {
          $type: "app.bsky.feed.post",
          text: rkey,
          createdAt: new Date(NOW - DAY).toISOString(),
          ...(reply && {
            reply: {
              root: { uri: reply.root, cid: CID },
              parent: { uri: reply.parent, cid: CID },
            },
          }),
        },
      });
      const { car } = yield* Effect.promise(() =>
        buildCar([
          post("3mxafgjedwb2a"),
          // Continuing my own thread.
          post("3mxafgjedwb2b", {
            root: mine("3mxafgjedwb2a"),
            parent: mine("3mxafgjedwb2a"),
          }),
          // Answering someone in my thread: a conversation, not the thread.
          post("3mxafgjedwb2c", {
            root: mine("3mxafgjedwb2a"),
            parent: theirs,
          }),
          // Replying in someone else's thread.
          post("3mxafgjedwb2d", { root: theirs, parent: theirs }),
          {
            collection: "is.sherman.unspecced.thread",
            rkey: "3mxafgjedwb2e",
            record: {
              $type: "is.sherman.unspecced.thread",
              subject: { uri: mine("3mxafgjedwb2a"), cid: CID },
              title: "A thread",
              createdAt: new Date(NOW).toISOString(),
            },
          },
        ]),
      );
      const result = yield* snapshot({ since: NOW - 30 * DAY }).pipe(
        Effect.provide(mockNetwork(network({ getRepo: serveCar(car) }))),
      );
      assert.strictEqual(result._tag, "Snapshot");
      if (result._tag !== "Snapshot") return;
      const rollups = Object.fromEntries(
        result.activities.map((a) => [
          a.id.split("/").slice(3).join("/"),
          { group: a.group, collects: a.collects },
        ]),
      );
      assert.deepStrictEqual(rollups, {
        "app.bsky.feed.post/3mxafgjedwb2a": {
          group: mine("3mxafgjedwb2a"),
          collects: undefined,
        },
        "app.bsky.feed.post/3mxafgjedwb2b": {
          group: mine("3mxafgjedwb2a"),
          collects: undefined,
        },
        "app.bsky.feed.post/3mxafgjedwb2c": {
          group: undefined,
          collects: undefined,
        },
        "app.bsky.feed.post/3mxafgjedwb2d": {
          group: undefined,
          collects: undefined,
        },
        "is.sherman.unspecced.thread/3mxafgjedwb2e": {
          group: undefined,
          collects: mine("3mxafgjedwb2a"),
        },
      });
    }),
  );

  it.effect("skips the export when the repo revision hasn't changed", () =>
    Effect.gen(function* () {
      const { car, rev, cid } = yield* Effect.promise(() => buildCar());
      const net = network({
        getRepo: serveCar(car),
        getLatestCommit: async () => Response.json({ cid, rev }),
      });
      const result = yield* snapshot({ since: 0, checkpoint: rev }).pipe(
        Effect.provide(mockNetwork(net)),
      );
      assert.strictEqual(result._tag, "Unchanged");
      assert.deepStrictEqual(net.calls, ["getLatestCommit"]);
    }),
  );

  it.effect("fetches the export when the revision moved on", () =>
    Effect.gen(function* () {
      const { car, rev, cid } = yield* Effect.promise(() => buildCar());
      const net = network({
        getRepo: serveCar(car),
        getLatestCommit: async () => Response.json({ cid, rev }),
      });
      const result = yield* snapshot({
        since: 0,
        checkpoint: "3aaaaaaaaaaaa",
      }).pipe(Effect.provide(mockNetwork(net)));
      assert.strictEqual(result._tag, "Snapshot");
      assert.deepStrictEqual(net.calls, ["getLatestCommit", "getRepo"]);
    }),
  );

  it.effect("surfaces XRPC errors from getRepo", () =>
    Effect.gen(function* () {
      const exit = yield* snapshot({ since: 0 }).pipe(
        Effect.provide(
          mockNetwork(
            network({
              getRepo: async () =>
                Response.json(
                  { error: "RepoNotFound", message: "Could not find repo" },
                  { status: 400 },
                ),
            }),
          ),
        ),
        Effect.exit,
      );
      const failure = sourceError(exit);
      assert.strictEqual(failure?._tag, "SourceError");
      assert.deepInclude(failure?.cause as object, {
        _tag: "XrpcError",
        nsid: "com.atproto.sync.getRepo",
        error: "RepoNotFound",
        status: 400,
        retryable: false,
      });
    }),
  );

  it.effect("passes a rate limit's reset time on, without retrying", () =>
    Effect.gen(function* () {
      const resetAt = Math.floor(Date.now() / 1000) + 600;
      const net = network({
        getLatestCommit: async () =>
          Response.json(
            { error: "RateLimitExceeded", message: "Rate Limit Exceeded" },
            { status: 429, headers: { "ratelimit-reset": String(resetAt) } },
          ),
      });
      const exit = yield* snapshot({
        since: 0,
        checkpoint: "3aaaaaaaaaaaa",
      }).pipe(Effect.provide(mockNetwork(net)), Effect.exit);
      assert.strictEqual(sourceError(exit)?.retryAt, resetAt * 1000);
      assert.deepStrictEqual(net.calls, ["getLatestCommit"]);
    }),
  );

  it.effect("fingerprints the DID and each collection's mapper version", () =>
    Effect.gen(function* () {
      const source = yield* makeSource.pipe(
        Effect.provide(mockNetwork(network({}))),
      );
      assert.strictEqual(
        source.fingerprint,
        `did=${DID};collections=app.bsky.feed.post@2,fm.teal.feed.play@1,is.sherman.unspecced.thread@1`,
      );
    }),
  );
});

describe("AtprotoRepo changes", () => {
  const time = new Date(NOW).toISOString();
  const uri = (collection: string, rkey: string) =>
    `at://${DID}/${collection}/${rkey}`;
  /** Test events skip the SDK's branded string types. */
  const event = (e: object) => e as JetstreamEvent;
  const put = (
    seq: number,
    collection: string,
    rkey: string,
    record: Record<string, unknown> | undefined,
    operation: "create" | "update" = "create",
  ) =>
    event({
      kind: "commit",
      did: DID,
      seq,
      time,
      commit: {
        operation,
        collection,
        rkey,
        rev: `rev${seq}`,
        cid: "bafyreia7rgxu7467phwpcgzaw62l5bzmxufkpikrc5zm4q3xhjmuhq4pti",
        record: record as never,
        ...(record === undefined && { validationError: new Error("bad") }),
      },
    });
  const post = (text: string, createdAt = NOW) => ({
    $type: "app.bsky.feed.post",
    text,
    createdAt: new Date(createdAt).toISOString(),
  });

  /** Every change the source makes of `events`, opened at `cursor`. */
  const changesOf = (
    events: (
      options: SubscribeOptions,
    ) => Stream.Stream<JetstreamEvent, JetstreamError | CursorTooOld>,
    cursor: string | undefined,
  ) =>
    Effect.gen(function* () {
      yield* TestClock.setTime(NOW);
      const jetstream = fakeJetstream(events);
      const source = yield* makeAtprotoRepoSource({
        did: DID,
        collections,
      }).pipe(
        Effect.provide(jetstream.layer),
        Effect.provide(mockNetwork(network({}))),
      );
      const changes = yield* source.changes!({ cursor }).pipe(
        Stream.runCollect,
        Effect.exit,
      );
      return { changes, subscriptions: jetstream.subscriptions };
    });

  it.effect(
    "maps commits with the snapshot handlers, resuming at the cursor",
    () =>
      Effect.gen(function* () {
        const post1 = uri("app.bsky.feed.post", "3mxafgjedwc2y");
        const { changes, subscriptions } = yield* changesOf(
          () =>
            Stream.make(
              put(11, "app.bsky.feed.post", "3mxafgjedwc2y", post("hi")),
              // An edit that no longer parses removes the earlier version.
              put(
                12,
                "app.bsky.feed.post",
                "3mxafgjedwc2y",
                { $type: "app.bsky.feed.post" },
                "update",
              ),
              // So does one the SDK couldn't convert at all.
              put(
                13,
                "app.bsky.feed.post",
                "3mxafgjedwc2y",
                undefined,
                "update",
              ),
              event({
                kind: "commit",
                did: DID,
                seq: 14,
                time,
                commit: {
                  operation: "delete",
                  collection: "app.bsky.feed.post",
                  rkey: "3mxafgjedwc2y",
                  rev: "rev14",
                },
              }),
              // Not cached, but the rev still moves on.
              put(15, "app.bsky.feed.like", "3mxafgjedwc2a", {
                $type: "app.bsky.feed.like",
              }),
              // Edited, but older than what's kept.
              put(
                16,
                "app.bsky.feed.post",
                "3jzfcijpj2z2a",
                post("old", NOW - 60 * DAY),
                "update",
              ),
              event({
                kind: "identity",
                did: DID,
                seq: 17,
                time,
                identity: { did: DID },
              }),
            ),
          "10",
        );
        assert.deepStrictEqual(subscriptions, [{ dids: [DID], cursor: 10 }]);
        assert.isTrue(Exit.isSuccess(changes));
        if (!Exit.isSuccess(changes)) return;
        const [created, ...rest] = changes.value;
        assert.strictEqual(created?._tag, "Batch");
        if (created?._tag !== "Batch") return;
        assert.strictEqual(created.cursor, "11");
        assert.strictEqual(created.checkpoint, "rev11");
        const upsert = created.mutations[0];
        assert.strictEqual(upsert?._tag, "Upsert");
        if (upsert?._tag !== "Upsert") return;
        assert.strictEqual(upsert.activity.id, post1);
        assert.strictEqual(upsert.activity.timestamp, NOW);
        assert.strictEqual(upsert.activity.group, post1);
        assert.deepStrictEqual(rest, [
          Change.batch([Mutation.delete(post1)], "12", "rev12"),
          Change.batch([Mutation.delete(post1)], "13", "rev13"),
          Change.batch([Mutation.delete(post1)], "14", "rev14"),
          Change.batch([], "15", "rev15"),
          Change.batch(
            [Mutation.delete(uri("app.bsky.feed.post", "3jzfcijpj2z2a"))],
            "16",
            "rev16",
          ),
          Change.batch([], "17"),
        ]);
      }),
  );

  it.effect(
    "reports a gap when the repo is reset or the cursor was clamped",
    () =>
      Effect.gen(function* () {
        const { changes } = yield* changesOf(
          () =>
            Stream.make(
              event({
                kind: "info",
                name: "OutdatedCursor",
                message: "clamped",
              }),
              event({
                kind: "sync",
                did: DID,
                seq: 21,
                time,
                sync: { did: DID, rev: "rev21" },
              }),
            ),
          "20",
        );
        assert.deepStrictEqual(
          changes,
          Exit.succeed([Change.gap(), Change.gap("21")]),
        );
      }),
  );

  it.effect(
    "starts from just before now when there's no cursor, as a gap",
    () =>
      Effect.gen(function* () {
        const { changes, subscriptions } = yield* changesOf(
          () => Stream.empty,
          undefined,
        );
        const start = (NOW - 60_000) * 1000;
        assert.deepStrictEqual(subscriptions, [{ dids: [DID], cursor: start }]);
        assert.deepStrictEqual(
          changes,
          Exit.succeed([Change.gap(String(start))]),
        );
      }),
  );

  it.effect("starts over from now when the cursor is too old to resume", () =>
    Effect.gen(function* () {
      const { changes, subscriptions } = yield* changesOf(
        (options) =>
          options.cursor === 5
            ? Stream.fail(new CursorTooOld({ cursor: 5 }))
            : Stream.make(
                put(31, "app.bsky.feed.like", "3mxafgjedwc2a", {
                  $type: "app.bsky.feed.like",
                }),
              ),
        "5",
      );
      const start = (NOW - 60_000) * 1000;
      assert.deepStrictEqual(
        subscriptions.map((s) => s.cursor),
        [5, start],
      );
      assert.deepStrictEqual(
        changes,
        Exit.succeed([
          Change.gap(String(start)),
          Change.batch([], "31", "rev31"),
        ]),
      );
    }),
  );

  it.effect("fails with a SourceError when Jetstream gives up", () =>
    Effect.gen(function* () {
      const { changes } = yield* changesOf(
        () => Stream.fail(new JetstreamError({ message: "gone", cause: null })),
        "1",
      );
      const error = sourceError(changes);
      assert.strictEqual(error?._tag, "SourceError");
      assert.strictEqual(error?.message, "gone");
    }),
  );
});
