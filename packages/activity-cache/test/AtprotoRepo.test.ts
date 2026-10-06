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
  return concatBytesAsync(getFullRepo(storage, repo.cid));
};

/** Serves a DID document and `getRepo` for `DID`. */
const mockNetwork = (getRepo: () => Promise<Response>) =>
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
        if (url.href.startsWith(`${PDS}/xrpc/com.atproto.sync.getRepo?`)) {
          assert.strictEqual(url.searchParams.get("did"), DID);
          return getRepo();
        }
        return new Response(null, { status: 404 });
      }).pipe(
        Effect.map((response) => HttpClientResponse.fromWeb(request, response)),
      ),
    ),
  );

const backfill = (since: number) =>
  Effect.gen(function* () {
    const source = yield* makeAtprotoRepoSource({ did: DID, collections });
    return yield* Stream.runCollect(source.backfill(since));
  });

describe("AtprotoRepo", () => {
  it.effect("maps cached collections from a full repo export", () =>
    Effect.gen(function* () {
      const car = yield* Effect.promise(buildCar);
      const activities = yield* backfill(NOW - 30 * DAY).pipe(
        Effect.provide(
          mockNetwork(
            async () =>
              new Response(car, {
                headers: { "content-type": "application/vnd.ipld.car" },
              }),
          ),
        ),
      );

      const byId = new Map(activities.map((a) => [a.id, a]));
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

  it.effect("surfaces XRPC errors from getRepo", () =>
    Effect.gen(function* () {
      const exit = yield* backfill(0).pipe(
        Effect.provide(
          mockNetwork(async () =>
            Response.json(
              { error: "RepoNotFound", message: "Could not find repo" },
              { status: 400 },
            ),
          ),
        ),
        Effect.exit,
      );
      assert.isTrue(Exit.isFailure(exit));
      const error = Exit.isFailure(exit) ? exit.cause.reasons[0] : undefined;
      assert.strictEqual(error?._tag, "Fail");
      const failure = error?._tag === "Fail" ? error.error : undefined;
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
});
