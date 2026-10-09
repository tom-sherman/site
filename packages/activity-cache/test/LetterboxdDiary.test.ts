import { assert, describe, it } from "@effect/vitest";
import { Duration, Effect, Exit, Layer } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { makeLetterboxdDiarySource } from "../src/sources/letterboxd/LetterboxdDiary.ts";

const USER = "tomus";
const FEED = `https://letterboxd.com/${USER}/rss/`;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-06T12:00:00Z");

const POSTER =
  "https://a.ltrbxd.com/resized/film-poster/4/4/5/9/4/44594-ponyo-0-600-0-900-crop.jpg?v=6e5faa20db";

/** An `<item>` shaped like Letterboxd's, for a diary entry. */
const entry = (options: {
  readonly guid: string;
  readonly daysAgo: number;
  readonly title?: string;
  readonly rating?: string;
  /** Paragraphs of HTML after the poster. */
  readonly description?: ReadonlyArray<string>;
}) => {
  const title = options.title ?? "Ponyo";
  return `
    <item>
      <title>${title}, 2008</title>
      <link>https://letterboxd.com/${USER}/film/ponyo/</link>
      <guid isPermaLink="false">${options.guid}</guid>
      <pubDate>${new Date(NOW - options.daysAgo * DAY).toUTCString()}</pubDate>
      <letterboxd:watchedDate>2026-10-04</letterboxd:watchedDate>
      <letterboxd:rewatch>Yes</letterboxd:rewatch>
      <letterboxd:filmTitle>${title}</letterboxd:filmTitle>
      <letterboxd:filmYear>2008</letterboxd:filmYear>
      ${options.rating === undefined ? "" : `<letterboxd:memberRating>${options.rating}</letterboxd:memberRating>`}
      <letterboxd:memberLike>No</letterboxd:memberLike>
      <tmdb:movieId>12429</tmdb:movieId>
      <description><![CDATA[ <p><img src="${POSTER}"/></p> ${(options.description ?? ["<p>Watched on Sunday October 4, 2026.</p>"]).join(" ")} ]]></description>
      <dc:creator>Tom</dc:creator>
    </item>`;
};

const list = `
  <item>
    <title>Nolan</title>
    <link>https://letterboxd.com/${USER}/list/nolan/</link>
    <guid isPermaLink="false">letterboxd-list-85222725</guid>
    <pubDate>${new Date(NOW - DAY).toUTCString()}</pubDate>
    <description><![CDATA[ <ul><li><a href="https://letterboxd.com/film/tenet/">Tenet</a></li></ul> ]]></description>
  </item>`;

const rss = (
  ...items: ReadonlyArray<string>
) => `<?xml version='1.0' encoding='utf-8'?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org">
  <channel>
    <title>Letterboxd - Tom</title>
    <link>https://letterboxd.com/${USER}/</link>
    ${items.join("\n")}
  </channel>
</rss>`;

/** Serves `respond` for the feed, counting requests. */
const mockNetwork = (respond: () => Response) => {
  const requests: Array<Readonly<Record<string, string>>> = [];
  const layer = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.sync(() => {
        requests.push(request.headers);
        return HttpClientResponse.fromWeb(
          request,
          url.href === FEED ? respond() : new Response(null, { status: 404 }),
        );
      }),
    ),
  );
  return { layer, requests };
};

const serve = (xml: string) => () =>
  new Response(xml, {
    headers: { "content-type": "application/rss+xml;charset=utf-8" },
  });

const snapshot = (options: {
  readonly since?: number;
  readonly checkpoint?: string;
}) =>
  Effect.gen(function* () {
    const source = yield* makeLetterboxdDiarySource({ user: USER });
    return yield* source.snapshot({
      since: options.since ?? NOW - 30 * DAY,
      checkpoint: options.checkpoint,
    });
  });

const sourceError = <A, E>(exit: Exit.Exit<A, E>) => {
  const reason = Exit.isFailure(exit) ? exit.cause.reasons[0] : undefined;
  return reason?._tag === "Fail" ? reason.error : undefined;
};

describe("LetterboxdDiary", () => {
  it.effect("keeps ratings and reviews, and leaves the rest out", () =>
    Effect.gen(function* () {
      const net = mockNetwork(
        serve(
          rss(
            entry({ guid: "letterboxd-watch-5", daysAgo: 1, rating: "3.5" }),
            // Logged without a rating or a review.
            entry({ guid: "letterboxd-watch-4", daysAgo: 2 }),
            list,
            entry({
              guid: "letterboxd-review-3",
              daysAgo: 3,
              description: ["<p>Woke fish</p>"],
            }),
            // Older than `since`.
            entry({ guid: "letterboxd-watch-2", daysAgo: 40, rating: "5.0" }),
          ),
        ),
      );
      const result = yield* snapshot({}).pipe(Effect.provide(net.layer));
      assert.strictEqual(result._tag, "Snapshot");
      if (result._tag !== "Snapshot") return;

      assert.deepStrictEqual(
        result.activities.map((a) => [a.id, a.type, a.timestamp]),
        [
          ["letterboxd:watch-5", "letterboxd.rating", NOW - DAY],
          ["letterboxd:review-3", "letterboxd.review", NOW - 3 * DAY],
        ],
      );
      assert.deepStrictEqual(result.activities[0]!.data, {
        url: `https://letterboxd.com/${USER}/film/ponyo/`,
        film: { title: "Ponyo", year: 2008, poster: POSTER, tmdbId: 12429 },
        watchedDate: "2026-10-04",
        rewatch: true,
        liked: false,
        rating: 3.5,
      });
      // A review needn't have a rating.
      assert.deepInclude(result.activities[1]!.data as object, {
        review: "Woke fish",
        spoilers: false,
      });
      assert.notProperty(result.activities[1]!.data, "rating");
      assert.deepStrictEqual(result.refreshAfter, Duration.minutes(10));
      // Back to the oldest diary entry, kept or not.
      assert.strictEqual(result.completeAfter, NOW - 40 * DAY);
      assert.isDefined(net.requests[0]!["user-agent"]);
    }),
  );

  it.effect("turns a review into plain text", () =>
    Effect.gen(function* () {
      const net = mockNetwork(
        serve(
          rss(
            entry({
              guid: "letterboxd-review-1",
              daysAgo: 1,
              // Double-encoded, as Letterboxd serves titles.
              title: "We&#039;re All Going to the World&#039;s Fair",
              rating: "1.5",
              description: [
                "<p><em>This review may contain spoilers.</em></p>",
                "<p>It&#8217;s <b>so</b>\n  quiet.<br />Too quiet.</p>",
                "<p>Second &amp; last.</p>",
              ],
            }),
          ),
        ),
      );
      const result = yield* snapshot({}).pipe(Effect.provide(net.layer));
      assert.strictEqual(result._tag, "Snapshot");
      if (result._tag !== "Snapshot") return;
      const data = result.activities[0]!.data as Record<string, unknown>;
      assert.strictEqual(
        (data["film"] as Record<string, unknown>)["title"],
        "We're All Going to the World's Fair",
      );
      assert.strictEqual(
        data["review"],
        "It’s so quiet.\nToo quiet.\n\nSecond & last.",
      );
      assert.strictEqual(data["spoilers"], true);
    }),
  );

  it.effect("skips entries it can't read, and keeps the rest", () =>
    Effect.gen(function* () {
      const net = mockNetwork(
        serve(
          rss(
            entry({ guid: "letterboxd-watch-3", daysAgo: 1, rating: "4.0" }),
            entry({ guid: "letterboxd-watch-2", daysAgo: 1, rating: "lots" }),
            // Not a rating the API serves.
            entry({ guid: "letterboxd-watch-1", daysAgo: 1, rating: "7.0" }),
          ),
        ),
      );
      const result = yield* snapshot({}).pipe(Effect.provide(net.layer));
      assert.strictEqual(result._tag, "Snapshot");
      if (result._tag !== "Snapshot") return;
      assert.deepStrictEqual(
        result.activities.map((a) => a.id),
        ["letterboxd:watch-3"],
      );
    }),
  );

  it.effect("serves an empty feed as no activity, keeping what's stored", () =>
    Effect.gen(function* () {
      const net = mockNetwork(serve(rss()));
      const result = yield* snapshot({}).pipe(Effect.provide(net.layer));
      assert.strictEqual(result._tag, "Snapshot");
      if (result._tag !== "Snapshot") return;
      assert.deepStrictEqual(result.activities, []);
      // So it doesn't delete anything stored. The test clock starts at 0.
      assert.strictEqual(result.completeAfter, 0);
    }),
  );

  it.effect("is unchanged when the feed is", () =>
    Effect.gen(function* () {
      const xml = rss(
        entry({ guid: "letterboxd-watch-1", daysAgo: 1, rating: "4.0" }),
      );
      const net = mockNetwork(serve(xml));
      const first = yield* snapshot({}).pipe(Effect.provide(net.layer));
      assert.strictEqual(first._tag, "Snapshot");
      if (first._tag !== "Snapshot") return;
      assert.isDefined(first.checkpoint);

      const again = yield* snapshot({ checkpoint: first.checkpoint }).pipe(
        Effect.provide(net.layer),
      );
      assert.deepStrictEqual(again, {
        _tag: "Unchanged",
        refreshAfter: Duration.minutes(10),
      });

      const changed = yield* snapshot({ checkpoint: first.checkpoint }).pipe(
        Effect.provide(mockNetwork(serve(rss())).layer),
      );
      assert.strictEqual(changed._tag, "Snapshot");
    }),
  );

  it.effect("honours Retry-After, without retrying", () =>
    Effect.gen(function* () {
      const net = mockNetwork(
        () =>
          new Response("Too Many Requests", {
            status: 429,
            headers: { "retry-after": "60" },
          }),
      );
      const exit = yield* snapshot({}).pipe(
        Effect.provide(net.layer),
        Effect.exit,
      );
      const error = sourceError(exit);
      assert.strictEqual(error?._tag, "SourceError");
      // The test clock starts at 0.
      assert.strictEqual(error?.retryAt, 60_000);
      assert.strictEqual(net.requests.length, 1);
    }),
  );

  it.effect("fails on something that isn't the feed", () =>
    Effect.gen(function* () {
      const net = mockNetwork(
        serve("<html><body>Just a moment…</body></html>"),
      );
      const exit = yield* snapshot({}).pipe(
        Effect.provide(net.layer),
        Effect.exit,
      );
      assert.deepInclude(sourceError(exit)?.cause as object, {
        _tag: "LetterboxdError",
        retryable: false,
      });
    }),
  );

  it.effect("fingerprints the user and mapper version", () =>
    Effect.gen(function* () {
      const source = yield* makeLetterboxdDiarySource({ user: USER }).pipe(
        Effect.provide(mockNetwork(serve(rss())).layer),
      );
      assert.strictEqual(source.name, "letterboxd");
      assert.strictEqual(source.fingerprint, `user=${USER};version=1`);
    }),
  );
});
