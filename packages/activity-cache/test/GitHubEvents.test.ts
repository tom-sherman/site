import { assert, describe, it } from "@effect/vitest";
import { Duration, Effect, Exit, Layer, Redacted } from "effect";
import { HttpClient, HttpClientResponse } from "effect/http";
import { makeGitHubEventsSource } from "../src/sources/github/GitHubEvents.ts";

const USER = "octocat";
const EVENTS = `https://api.github.com/users/${USER}/events/public`;

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-06T12:00:00Z");

const event = (id: string, daysAgo: number, type = "PushEvent") => ({
  id,
  type,
  actor: { login: USER },
  repo: { name: `${USER}/hello-world` },
  payload: {},
  public: true,
  created_at: new Date(NOW - daysAgo * DAY).toISOString(),
});

interface Request {
  readonly url: URL;
  readonly headers: Readonly<Record<string, string>>;
}

/** Serves `respond` for the events endpoint, recording every request. */
const mockNetwork = (respond: (request: Request) => Response) => {
  const requests: Array<Request> = [];
  const layer = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) =>
      Effect.sync(() => {
        const recorded = { url, headers: request.headers };
        requests.push(recorded);
        return HttpClientResponse.fromWeb(
          request,
          url.href.startsWith(EVENTS)
            ? respond(recorded)
            : new Response(null, { status: 404 }),
        );
      }),
    ),
  );
  return { layer, requests };
};

/** Three pages linked by `Link` headers, like GitHub serves them. */
const pages: ReadonlyArray<ReadonlyArray<ReturnType<typeof event>>> = [
  [event("5", 1, "WatchEvent"), event("4", 2)],
  // "4" again: it was pushed onto this page by a new event while paging.
  [event("4", 2), { id: "3", type: "PushEvent" } as never, event("2", 40)],
  [event("1", 50)],
];
const pageUrl = (page: number) =>
  `${EVENTS}?per_page=100${page > 1 ? `&page=${page}` : ""}`;
const servePages = (request: Request) => {
  const page = Number(request.url.searchParams.get("page") ?? "1");
  const next = page < pages.length ? pageUrl(page + 1) : undefined;
  return Response.json(pages[page - 1], {
    headers: {
      etag: `W/"page-${page}"`,
      "x-poll-interval": "90",
      ...(next && {
        link: `<${next}>; rel="next", <${pageUrl(3)}>; rel="last"`,
      }),
    },
  });
};

const snapshot = (options: {
  readonly since?: number;
  readonly checkpoint?: string;
  readonly token?: string;
}) =>
  Effect.gen(function* () {
    const source = yield* makeGitHubEventsSource({
      user: USER,
      token:
        options.token === undefined ? undefined : Redacted.make(options.token),
    });
    return yield* source.snapshot({
      since: options.since ?? NOW - 30 * DAY,
      checkpoint: options.checkpoint,
    });
  });

const sourceError = <A, E>(exit: Exit.Exit<A, E>) => {
  const reason = Exit.isFailure(exit) ? exit.cause.reasons[0] : undefined;
  return reason?._tag === "Fail" ? reason.error : undefined;
};

describe("GitHubEvents", () => {
  it.effect("pages through public events until it's past `since`", () =>
    Effect.gen(function* () {
      const net = mockNetwork(servePages);
      const result = yield* snapshot({ token: "secret" }).pipe(
        Effect.provide(net.layer),
      );
      assert.strictEqual(result._tag, "Snapshot");
      if (result._tag !== "Snapshot") return;

      // Page 2 reached an event older than `since`, so page 3 isn't fetched.
      assert.deepStrictEqual(
        net.requests.map((r) => r.url.href),
        [pageUrl(1), pageUrl(2)],
      );
      // Deduplicated, the invalid event skipped, the too-old one left out.
      assert.deepStrictEqual(
        result.activities.map((a) => [a.id, a.type, a.timestamp]),
        [
          ["github:5", "github.WatchEvent", NOW - DAY],
          ["github:4", "github.PushEvent", NOW - 2 * DAY],
        ],
      );
      assert.deepStrictEqual(result.activities[0]!.data, pages[0]![0]);
      assert.strictEqual(result.checkpoint, `W/"page-1"`);
      assert.deepStrictEqual(result.refreshAfter, Duration.seconds(90));

      const headers = net.requests[0]!.headers;
      assert.strictEqual(headers["authorization"], "Bearer secret");
      assert.strictEqual(headers["accept"], "application/vnd.github+json");
      assert.isDefined(headers["user-agent"]);
      assert.isUndefined(headers["if-none-match"]);
    }),
  );

  it.effect("follows every page when nothing is older than `since`", () =>
    Effect.gen(function* () {
      const net = mockNetwork(servePages);
      const result = yield* snapshot({ since: 0 }).pipe(
        Effect.provide(net.layer),
      );
      assert.strictEqual(net.requests.length, 3);
      assert.strictEqual(result._tag, "Snapshot");
      if (result._tag !== "Snapshot") return;
      assert.deepStrictEqual(
        result.activities.map((a) => a.id),
        ["github:5", "github:4", "github:2", "github:1"],
      );
    }),
  );

  it.effect("is unchanged when the first page's ETag still matches", () =>
    Effect.gen(function* () {
      const net = mockNetwork(
        () =>
          new Response(null, {
            status: 304,
            headers: { "x-poll-interval": "120" },
          }),
      );
      const result = yield* snapshot({
        checkpoint: `W/"page-1"`,
        token: "secret",
      }).pipe(Effect.provide(net.layer));
      assert.deepStrictEqual(result, {
        _tag: "Unchanged",
        refreshAfter: Duration.seconds(120),
      });
      assert.strictEqual(net.requests.length, 1);
      assert.strictEqual(
        net.requests[0]!.headers["if-none-match"],
        `W/"page-1"`,
      );
    }),
  );

  it.effect("polls at most every 5 minutes without a token", () =>
    Effect.gen(function* () {
      const net = mockNetwork(servePages);
      const result = yield* snapshot({}).pipe(Effect.provide(net.layer));
      assert.deepStrictEqual(result.refreshAfter, Duration.minutes(5));
      assert.isUndefined(net.requests[0]!.headers["authorization"]);
    }),
  );

  it.effect("passes the rate limit's reset time on, without retrying", () =>
    Effect.gen(function* () {
      const resetAt = Math.floor(NOW / 1000) + 600;
      const net = mockNetwork(() =>
        Response.json(
          { message: "API rate limit exceeded" },
          {
            status: 403,
            headers: {
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": String(resetAt),
            },
          },
        ),
      );
      const exit = yield* snapshot({}).pipe(
        Effect.provide(net.layer),
        Effect.exit,
      );
      const error = sourceError(exit);
      assert.strictEqual(error?._tag, "SourceError");
      assert.strictEqual(error?.retryAt, resetAt * 1000);
      assert.strictEqual(net.requests.length, 1);
    }),
  );

  it.effect("honours Retry-After from a secondary rate limit", () =>
    Effect.gen(function* () {
      const net = mockNetwork(() =>
        Response.json(
          { message: "You have exceeded a secondary rate limit" },
          { status: 429, headers: { "retry-after": "60" } },
        ),
      );
      const exit = yield* snapshot({}).pipe(
        Effect.provide(net.layer),
        Effect.exit,
      );
      // The test clock starts at 0.
      assert.strictEqual(sourceError(exit)?.retryAt, 60_000);
      assert.strictEqual(net.requests.length, 1);
    }),
  );

  it.effect("surfaces other errors without retrying them", () =>
    Effect.gen(function* () {
      const net = mockNetwork(() =>
        Response.json({ message: "Not Found" }, { status: 404 }),
      );
      const exit = yield* snapshot({}).pipe(
        Effect.provide(net.layer),
        Effect.exit,
      );
      const error = sourceError(exit);
      assert.strictEqual(error?.retryAt, undefined);
      assert.deepInclude(error?.cause as object, {
        _tag: "GitHubError",
        status: 404,
        retryable: false,
      });
      assert.strictEqual(net.requests.length, 1);
    }),
  );

  it.effect("fingerprints the user and mapper version", () =>
    Effect.gen(function* () {
      const source = yield* makeGitHubEventsSource({ user: USER }).pipe(
        Effect.provide(mockNetwork(servePages).layer),
      );
      assert.strictEqual(source.name, "github");
      assert.strictEqual(source.fingerprint, `user=${USER};version=1`);
    }),
  );
});
