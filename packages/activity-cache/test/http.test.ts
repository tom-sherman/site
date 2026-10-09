import { assert, describe, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/http";
import type { FeedEntry } from "../src/Activity.ts";
import { ActivityCache } from "../src/ActivityCache.ts";
import { HttpLayer } from "../src/http.ts";
import { OidcVerifier } from "../src/oidc/OidcVerifier.ts";

const DID = "did:plc:2xau7wbgdq4phuou2ypwuen7";
const CID = "bafyreigxzhhexz5ixjzc4ijvbb6rksgfejtnwyxhytwwm3szynvknp3htu";
const BLOB = "bafkreibwzj2x3wse2xu6s4b6uo3bipz2ncjj4xfm23qu6wt6f6r36wgfiy";
const T = Date.parse("2026-10-01T12:00:00Z");
const at = (offset: number) => new Date(T + offset).toISOString();
const uri = (collection: string, rkey: string) =>
  `at://${DID}/${collection}/${rkey}`;

/** A post with CIDs and a blob, which are what the JSON encoding is for. */
const post = (rkey: string, offset: number): FeedEntry => ({
  id: uri("app.bsky.feed.post", rkey),
  timestamp: T + offset,
  type: "app.bsky.feed.post",
  data: {
    $type: "app.bsky.feed.post",
    text: `post ${rkey}`,
    createdAt: at(offset),
    reply: {
      root: { uri: uri("app.bsky.feed.post", "root"), cid: CID },
      parent: { uri: uri("app.bsky.feed.post", "root"), cid: CID },
    },
    embed: {
      $type: "app.bsky.embed.images",
      images: [
        {
          alt: "",
          image: {
            $type: "blob",
            ref: { $link: BLOB },
            mimeType: "image/png",
            size: 23713,
          },
        },
      ],
    },
  },
});

const thread: FeedEntry = {
  id: uri("is.sherman.unspecced.thread", "thread"),
  timestamp: T,
  type: "is.sherman.unspecced.thread",
  data: {
    $type: "is.sherman.unspecced.thread",
    subject: { uri: uri("app.bsky.feed.post", "root"), cid: CID },
    title: "A thread",
    createdAt: at(5000),
  },
  members: [post("root", 0), post("reply", 1000)],
};

const play: FeedEntry = {
  id: uri("fm.teal.feed.play", "play"),
  timestamp: T - 1000,
  type: "fm.teal.feed.play",
  data: {
    $type: "fm.teal.feed.play",
    trackName: "Acolyte",
    artists: [{ artistName: "Jónsi" }],
    playedTime: at(-1000),
  },
};

const push: FeedEntry = {
  id: "github:1",
  timestamp: T - 2000,
  type: "github.PushEvent",
  data: {
    id: "1",
    type: "PushEvent",
    actor: { login: "tom-sherman", avatar_url: "https://example.com/a.png" },
    repo: { name: "tom-sherman/site" },
    payload: { ref: "refs/heads/main", head: "b", before: "a", push_id: 1 },
    created_at: at(-2000),
  },
};

const request = async (
  entries: ReadonlyArray<FeedEntry>,
  path = "/activity",
) => {
  const { handler, dispose } = HttpRouter.toWebHandler(
    HttpLayer.pipe(
      Layer.provide(
        Layer.succeed(
          OidcVerifier,
          OidcVerifier.of({ verify: () => Effect.succeed({} as never) }),
        ),
      ),
      Layer.provide(
        Layer.succeed(
          ActivityCache,
          ActivityCache.of({
            apply: () => Effect.void,
            refresh: () => Effect.void,
            run: Effect.never,
            query: () => Effect.succeed(entries),
            prune: Effect.void,
            status: Effect.succeed([]),
          }),
        ),
      ),
      Layer.provide(HttpServer.layerServices),
    ),
    { disableLogger: true },
  );
  try {
    const response = await handler(
      new Request(`http://localhost${path}`, {
        headers: { authorization: "Bearer token" },
      }),
    );
    const text = await response.text();
    return {
      status: response.status,
      body: (text ? JSON.parse(text) : undefined) as {
        items: Array<unknown>;
        cursor: string | null;
      },
    };
  } finally {
    await dispose();
  }
};

describe("GET /activity", () => {
  it.live("serves atproto records as stored, through lexicon decoding", () =>
    Effect.promise(async () => {
      const { status, body } = await request([thread, play]);
      assert.strictEqual(status, 200);
      assert.deepStrictEqual(body.items, [thread, play]);
    }),
  );

  it.live("serves only the fields the API defines for GitHub events", () =>
    Effect.promise(async () => {
      const { body } = await request([push]);
      assert.deepStrictEqual(body.items, [
        {
          id: "github:1",
          timestamp: T - 2000,
          type: "github.PushEvent",
          data: {
            actor: { login: "tom-sherman" },
            repo: { name: "tom-sherman/site" },
            payload: { ref: "refs/heads/main", head: "b", before: "a" },
          },
        },
      ]);
    }),
  );

  it.live("leaves out entries it can't serve, and still pages on", () =>
    Effect.promise(async () => {
      const repost: FeedEntry = {
        id: uri("app.bsky.feed.repost", "repost"),
        timestamp: T - 3000,
        type: "app.bsky.feed.repost",
        data: {},
      };
      const invalid: FeedEntry = {
        ...post("invalid", -4000),
        data: { $type: "app.bsky.feed.post", text: "no createdAt" },
      };
      const { body } = await request(
        [play, repost, invalid],
        "/activity?limit=3",
      );
      assert.deepStrictEqual(body.items, [play]);
      assert.strictEqual(body.cursor, `${T - 4000}:${invalid.id}`);
    }),
  );

  it.live("only filters by types it serves", () =>
    Effect.promise(async () => {
      const served = await request([], "/activity?type=fm.teal.feed.play");
      assert.strictEqual(served.status, 200);
      const unserved = await request([], "/activity?type=app.bsky.feed.repost");
      assert.strictEqual(unserved.status, 400);
    }),
  );

  it.live("never serves a thread without its posts", () =>
    Effect.promise(async () => {
      const { body } = await request([{ ...thread, members: [] }]);
      assert.deepStrictEqual(body.items, []);
    }),
  );
});
