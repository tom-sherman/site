import {
  Clock,
  Duration,
  Effect,
  Option,
  type Redacted,
  Schedule,
  Schema,
} from "effect";
import {
  Headers,
  HttpClient,
  HttpClientRequest,
  type HttpClientResponse,
} from "effect/http";
import type { Activity } from "../../Activity.ts";
import { GitHubItem } from "../../ActivityItem.ts";
import { type Source, SourceError, SnapshotResult } from "../../Source.ts";

export class GitHubError extends Schema.TaggedError<GitHubError>()(
  "GitHubError",
  {
    message: Schema.String,
    /** HTTP status, when GitHub responded at all. */
    status: Schema.optional(Schema.Number),
    /** 5xx and network failures. */
    retryable: Schema.Boolean,
    /** When GitHub asked us to come back (epoch ms), from `Retry-After` or `X-RateLimit-Reset`. */
    retryAt: Schema.optional(Schema.Number),
    cause: Schema.Defect(),
  },
) {}

/** What every event has. Whether it's served depends on `GitHubItem`. */
const Event = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  created_at: Schema.String,
});
const isEvent = Schema.is(Event);
/** Event types the API serves, and with the fields it serves. */
const isServed = Schema.is(GitHubItem);
const servedTypes: ReadonlySet<string> = new Set(
  GitHubItem.members.map((member) => member.fields.type.literal),
);

const API = "https://api.github.com";

/** GitHub serves at most 300 events, so this is three pages at most. */
const PER_PAGE = 100;

/**
 * Bump when the mapping from events to activity changes, or `GitHubItem`
 * does, so stored rows get rebuilt.
 */
const VERSION = 2;

/** GitHub's own default, for when a response doesn't say. */
const DEFAULT_POLL_INTERVAL = Duration.seconds(60);

/**
 * Unauthenticated requests get 60 an hour per IP, and unlike authenticated
 * ones, a `304` still counts. Polling at GitHub's usual 60s would use all of
 * them, so without a token it's at most every 5 minutes.
 */
const UNAUTHENTICATED_POLL_INTERVAL = Duration.minutes(5);

const header = (
  response: HttpClientResponse.HttpClientResponse,
  name: string,
) => Option.getOrUndefined(Headers.get(response.headers, name));

/** `X-Poll-Interval` is in seconds. */
const pollInterval = (response: HttpClientResponse.HttpClientResponse) => {
  const seconds = Number(header(response, "x-poll-interval"));
  return seconds > 0 ? Duration.seconds(seconds) : DEFAULT_POLL_INTERVAL;
};

/** The `rel="next"` URL from a `Link` header. */
const nextLink = (response: HttpClientResponse.HttpClientResponse) =>
  header(response, "link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1];

/**
 * Secondary rate limits send `Retry-After`; running out of the primary limit
 * sends `X-RateLimit-Remaining: 0` and when it resets.
 */
const retryAtFromHeaders = (
  response: HttpClientResponse.HttpClientResponse,
  now: number,
): number | undefined => {
  const retryAfter = Number(header(response, "retry-after"));
  if (retryAfter > 0) return now + retryAfter * 1000;
  if (header(response, "x-ratelimit-remaining") === "0") {
    const reset = Number(header(response, "x-ratelimit-reset")) * 1000;
    if (reset > now) return reset;
  }
  return undefined;
};

/** Rate-limited responses carry a `retryAt`; retrying those here would only make it worse. */
const retryTransient = <A, R>(self: Effect.Effect<A, GitHubError, R>) =>
  Effect.retry(self, {
    while: (error) => error.retryable && error.retryAt === undefined,
    schedule: Schedule.exponential("500 millis"),
    times: 3,
  });

/**
 * One page of events. With `etag`, a page that hasn't changed comes back as
 * `undefined` (a `304`).
 */
const fetchPage = Effect.fn("fetchPage")(function* (
  url: string,
  options: {
    readonly token: Redacted.Redacted | undefined;
    readonly etag?: string | undefined;
  },
) {
  const client = yield* HttpClient.HttpClient;
  let request = HttpClientRequest.get(url).pipe(
    HttpClientRequest.setHeaders({
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "tom-sherman/site activity-cache",
    }),
  );
  if (options.token) {
    request = HttpClientRequest.bearerToken(request, options.token);
  }
  if (options.etag) {
    request = HttpClientRequest.setHeader(
      request,
      "if-none-match",
      options.etag,
    );
  }

  const response = yield* client
    .execute(request)
    .pipe(
      Effect.mapError(
        (cause) =>
          new GitHubError({ message: cause.message, retryable: true, cause }),
      ),
    );
  if (response.status === 304) return { response, events: undefined };
  if (response.status !== 200) {
    const now = yield* Clock.currentTimeMillis;
    const body = yield* response.text.pipe(Effect.orElseSucceed(() => ""));
    return yield* new GitHubError({
      message: `GitHub responded ${response.status}: ${body.slice(0, 200)}`,
      status: response.status,
      retryable: response.status >= 500,
      retryAt:
        response.status === 403 || response.status === 429
          ? retryAtFromHeaders(response, now)
          : undefined,
      cause: null,
    });
  }
  const body = yield* response.json.pipe(
    Effect.mapError(
      (cause) =>
        new GitHubError({ message: cause.message, retryable: true, cause }),
    ),
  );
  if (!Array.isArray(body)) {
    return yield* new GitHubError({
      message: "Expected an array of events",
      status: response.status,
      retryable: false,
      cause: null,
    });
  }
  return { response, events: body as ReadonlyArray<Schema.Json> };
});

const toActivity = (event: Schema.Json): Activity | undefined => {
  if (!isEvent(event)) return undefined;
  const timestamp = Date.parse(event.created_at);
  if (Number.isNaN(timestamp)) return undefined;
  return {
    id: `github:${event.id}`,
    timestamp,
    type: `github.${event.type}`,
    data: event,
  };
};

/**
 * Public events from `GET /users/{user}/events/public`: pushes, PRs, stars, …
 * Only public ones, even when the token can see more.
 *
 * GitHub only serves the last 30 days of events, and at most 300 of them, so
 * in a busy month older ones drop out early. Each snapshot is complete back to
 * the oldest event it got (`completeAfter`), so those are kept until they're
 * 30 days old, while events GitHub stops serving within its window (say, from
 * a repo made private) are removed.
 *
 * The checkpoint is the first page's ETag, so a refresh where nothing changed
 * is one conditional request (which, authenticated, doesn't count against the
 * rate limit). Each result asks to be refreshed after GitHub's
 * `X-Poll-Interval`.
 */
export const makeGitHubEventsSource = Effect.fn("makeGitHubEventsSource")(
  function* (options: {
    readonly user: string;
    readonly token?: Redacted.Redacted | undefined;
  }) {
    const client = yield* HttpClient.HttpClient;
    const { user, token } = options;
    const firstPage = `${API}/users/${encodeURIComponent(user)}/events/public?per_page=${PER_PAGE}`;

    const refreshAfter = (response: HttpClientResponse.HttpClientResponse) =>
      token
        ? pollInterval(response)
        : Duration.max(pollInterval(response), UNAUTHENTICATED_POLL_INTERVAL);

    const snapshot = ({
      since,
      checkpoint,
    }: {
      readonly since: number;
      readonly checkpoint: string | undefined;
    }) =>
      Effect.gen(function* () {
        const first = yield* fetchPage(firstPage, {
          token,
          etag: checkpoint,
        }).pipe(retryTransient);
        if (first.events === undefined) {
          return SnapshotResult.unchanged(refreshAfter(first.response));
        }

        // New events push older ones onto later pages while we're paging, so
        // the same event can turn up twice. Nothing is skipped: anything newer
        // than the first page changes its ETag, and is picked up next time.
        const activities = new Map<string, Activity>();
        let oldest: number | undefined;
        let page = { response: first.response, events: first.events };
        while (true) {
          let reachedSince = false;
          for (const event of page.events) {
            const activity = toActivity(event);
            if (activity === undefined) {
              yield* Effect.logWarning("Skipping invalid event");
              continue;
            }
            if (activity.timestamp < (oldest ?? Infinity)) {
              oldest = activity.timestamp;
            }
            if (activity.timestamp < since) {
              reachedSince = true;
            } else if (isServed(activity)) {
              activities.set(activity.id, activity);
            } else if (servedTypes.has(activity.type)) {
              yield* Effect.logWarning(
                "Skipping event that doesn't match its schema",
              ).pipe(
                Effect.annotateLogs({ id: activity.id, type: activity.type }),
              );
            }
            // Anything else is a type the API doesn't serve.
          }
          const next = nextLink(page.response);
          if (reachedSince || next === undefined) break;
          const nextPage = yield* fetchPage(next, { token }).pipe(
            retryTransient,
          );
          // Only conditional requests come back as `304`, so this has events.
          page = { response: nextPage.response, events: nextPage.events ?? [] };
        }

        return SnapshotResult.snapshot(
          [...activities.values()],
          header(first.response, "etag"),
          refreshAfter(first.response),
          // Everything since the oldest event served, of any type. With none,
          // it says nothing about what's stored.
          oldest ?? (yield* Clock.currentTimeMillis),
        );
      }).pipe(
        Effect.mapError(
          (cause) =>
            new SourceError({
              source: "github",
              message: cause.message,
              retryAt: cause.retryAt,
              cause,
            }),
        ),
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.withSpan("GitHubEvents.snapshot"),
      );

    return {
      name: "github",
      fingerprint: [`user=${user}`, `version=${VERSION}`].join(";"),
      snapshot,
    } satisfies Source;
  },
);
