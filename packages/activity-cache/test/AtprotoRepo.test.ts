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
import { Effect, Exit, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { makeAtprotoRepoSource } from "../src/sources/atproto/AtprotoRepo.ts";
import { collections } from "../src/sources/atproto/collections.ts";

const DID = "did:plc:testtesttesttesttesttest";
const PDS = "https://pds.example";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-06T12:00:00Z");

const buildCar = async () => {
  const storage = new MemoryBlockstore();
  const repo = await Repo.create(
    storage,
    DID,
    await Secp256k1Keypair.create(),
    (
      [
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
      ] satisfies Array<Omit<RecordCreateOp, "action">>
    ).map((write) => ({ action: WriteOpAction.Create, ...write })),
  );
  const car = await concatBytesAsync(getFullRepo(storage, repo.cid));
  return { car, rev: repo.commit.rev, cid: repo.cid.toString() };
};

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

const snapshot = (options: { since: number; checkpoint?: string }) =>
  Effect.gen(function* () {
    const source = yield* makeAtprotoRepoSource({
      did: DID,
      collections,
    });
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
      const { car, rev } = yield* Effect.promise(buildCar);
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

  it.effect("skips the export when the repo revision hasn't changed", () =>
    Effect.gen(function* () {
      const { car, rev, cid } = yield* Effect.promise(buildCar);
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
      const { car, rev, cid } = yield* Effect.promise(buildCar);
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
      const source = yield* makeAtprotoRepoSource({
        did: DID,
        collections,
      }).pipe(Effect.provide(mockNetwork(network({}))));
      assert.strictEqual(
        source.fingerprint,
        `did=${DID};collections=app.bsky.feed.post@1,fm.teal.feed.play@1`,
      );
    }),
  );
});
