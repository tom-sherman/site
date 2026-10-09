import { XMLParser } from "fast-xml-parser";
import { createHash } from "node:crypto";
import {
  Clock,
  Duration,
  Effect,
  Exit,
  Option,
  Schedule,
  Schema,
  SchemaGetter,
} from "effect";
import {
  Headers,
  HttpClient,
  HttpClientRequest,
  type HttpClientResponse,
} from "effect/http";
import { DomUtils, ElementType, parseDocument } from "htmlparser2";
import type { Activity } from "../../Activity.ts";
import { LetterboxdItem } from "../../ActivityItem.ts";
import { type Source, SourceError, SnapshotResult } from "../../Source.ts";

export class LetterboxdError extends Schema.TaggedError<LetterboxdError>()(
  "LetterboxdError",
  {
    message: Schema.String,
    /** HTTP status, when Letterboxd responded at all. */
    status: Schema.optional(Schema.Number),
    /** 5xx and network failures. */
    retryable: Schema.Boolean,
    /** When Letterboxd asked us to come back (epoch ms), from `Retry-After`. */
    retryAt: Schema.optional(Schema.Number),
    cause: Schema.Defect(),
  },
) {}

/**
 * Bump when the mapping from feed items to activity changes, or
 * `LetterboxdItem` does, so stored rows get rebuilt.
 */
const VERSION = 1;

/**
 * The feed has no `ETag` or `Last-Modified`, so every refresh downloads it
 * (about 50KB). New entries aren't urgent.
 */
const REFRESH_INTERVAL = Duration.minutes(10);

const YesNo = Schema.Literals(["Yes", "No"]).pipe(
  Schema.decodeTo(Schema.Boolean, {
    decode: SchemaGetter.transform((value) => value === "Yes"),
    encode: SchemaGetter.transform((value) => (value ? "Yes" : "No")),
  }),
);

/**
 * A diary entry in the RSS feed, as `fast-xml-parser` reads it: elements are
 * keyed by their qualified name, and every value is a string.
 */
const DiaryEntry = Schema.Struct({
  /** `letterboxd-watch-<id>` or `letterboxd-review-<id>`. */
  guid: Schema.String.check(
    Schema.isPattern(/^letterboxd-(watch|review)-\d+$/),
  ),
  link: Schema.String,
  pubDate: Schema.String,
  /** HTML: the poster, then the review, or "Watched on …" without one. */
  description: Schema.String,
  "letterboxd:filmTitle": Schema.String,
  "letterboxd:filmYear": Schema.optional(Schema.FiniteFromString),
  "letterboxd:watchedDate": Schema.optional(Schema.String),
  "letterboxd:rewatch": YesNo,
  "letterboxd:memberRating": Schema.optional(Schema.FiniteFromString),
  "letterboxd:memberLike": YesNo,
  "tmdb:movieId": Schema.optional(Schema.FiniteFromString),
});
type DiaryEntry = typeof DiaryEntry.Type;

/** Lists are in the feed too. Left out for now. */
const ListEntry = Schema.Struct({
  guid: Schema.String.check(Schema.isPattern(/^letterboxd-list-\d+$/)),
});

/** Decoded one at a time, so one odd entry doesn't hide the rest. */
const decodeItem = Schema.decodeUnknownExit(
  Schema.Union([DiaryEntry, ListEntry]),
);

const Feed = Schema.Struct({
  rss: Schema.Struct({
    channel: Schema.Struct({
      /** Missing when the feed is empty. */
      item: Schema.optional(Schema.Array(Schema.Unknown)),
    }),
  }),
});
const decodeFeed = Schema.decodeUnknownEffect(Feed);

const parser = new XMLParser({
  ignoreAttributes: true,
  // Keep values as strings; the schemas decode what's numeric.
  parseTagValue: false,
  // Titles are double-encoded: `We&#039;re All Going to the World&#039;s Fair`.
  htmlEntities: true,
  isArray: (name) => name === "item",
});

/** Only kept where the API serves it: rated films, and reviews. */
const isServed = Schema.is(LetterboxdItem);

/** Letterboxd puts this before a review's text when it's marked so. */
const SPOILER_WARNING = "This review may contain spoilers.";

type Node = ReturnType<typeof parseDocument>["children"][number];

/** Plain text, with `<br>`s as newlines and other whitespace collapsed. */
const textOf = (node: Node): string => {
  if (node.type === ElementType.Text) return node.data.replace(/\s+/g, " ");
  if (node.type !== ElementType.Tag) return "";
  if (node.name === "br") return "\n";
  return node.children.map(textOf).join("");
};

/** The poster, and the paragraphs after it, from an entry's description. */
const parseDescription = (html: string) => {
  const document = parseDocument(html);
  const poster = DomUtils.findOne(
    (element) => element.name === "img",
    document.children,
  )?.attribs["src"];
  const paragraphs = document.children
    .filter(
      (node) =>
        node.type === ElementType.Tag &&
        DomUtils.getElementsByTagName("img", node).length === 0,
    )
    .map((node) =>
      textOf(node)
        .split("\n")
        .map((line) => line.trim())
        .join("\n")
        .trim(),
    )
    .filter((paragraph) => paragraph !== "");
  return { poster, paragraphs };
};

/**
 * `undefined` for films logged without a rating or review: they're in the
 * diary, but there's nothing to say about them.
 */
const toActivity = (entry: DiaryEntry): Activity | undefined => {
  const [, kind, id] = entry.guid.split("-");
  const timestamp = Date.parse(entry.pubDate);
  if (Number.isNaN(timestamp)) return undefined;
  const year = entry["letterboxd:filmYear"];
  const tmdbId = entry["tmdb:movieId"];
  const watchedDate = entry["letterboxd:watchedDate"];
  const rating = entry["letterboxd:memberRating"];
  const { poster, paragraphs } = parseDescription(entry.description);
  const data = {
    url: entry.link,
    film: {
      title: entry["letterboxd:filmTitle"],
      ...(year !== undefined && { year }),
      ...(poster !== undefined && { poster }),
      ...(tmdbId !== undefined && { tmdbId }),
    },
    ...(watchedDate !== undefined && { watchedDate }),
    rewatch: entry["letterboxd:rewatch"],
    liked: entry["letterboxd:memberLike"],
    ...(rating !== undefined && { rating }),
  };

  if (kind === "review") {
    const spoilers = paragraphs[0] === SPOILER_WARNING;
    return {
      id: `letterboxd:review-${id}`,
      timestamp,
      type: "letterboxd.review",
      data: {
        ...data,
        review: (spoilers ? paragraphs.slice(1) : paragraphs).join("\n\n"),
        spoilers,
      },
    };
  }
  // A watch's description is just "Watched on …".
  if (rating === undefined) return undefined;
  return {
    id: `letterboxd:watch-${id}`,
    timestamp,
    type: "letterboxd.rating",
    data,
  };
};

/** Rate limits (Cloudflare's `429`s, or a `503` while it's struggling) may say when. */
const retryAtFromHeaders = (
  response: HttpClientResponse.HttpClientResponse,
  now: number,
): number | undefined => {
  const retryAfter = Number(
    Option.getOrUndefined(Headers.get(response.headers, "retry-after")),
  );
  return retryAfter > 0 ? now + retryAfter * 1000 : undefined;
};

/** Rate-limited responses carry a `retryAt`; retrying those here would only make it worse. */
const retryTransient = <A, R>(self: Effect.Effect<A, LetterboxdError, R>) =>
  Effect.retry(self, {
    while: (error) => error.retryable && error.retryAt === undefined,
    schedule: Schedule.exponential("500 millis"),
    times: 3,
  });

const fetchFeed = Effect.fn("fetchFeed")(function* (url: string) {
  const client = yield* HttpClient.HttpClient;
  const request = HttpClientRequest.get(url).pipe(
    HttpClientRequest.setHeaders({
      accept: "application/rss+xml",
      "user-agent": "tom-sherman/site activity-cache",
    }),
  );
  const response = yield* client.execute(request).pipe(
    Effect.mapError(
      (cause) =>
        new LetterboxdError({
          message: cause.message,
          retryable: true,
          cause,
        }),
    ),
  );
  if (response.status !== 200) {
    const now = yield* Clock.currentTimeMillis;
    return yield* new LetterboxdError({
      message: `Letterboxd responded ${response.status}`,
      status: response.status,
      retryable: response.status >= 500,
      retryAt: retryAtFromHeaders(response, now),
      cause: null,
    });
  }
  return yield* response.text.pipe(
    Effect.mapError(
      (cause) =>
        new LetterboxdError({ message: cause.message, retryable: true, cause }),
    ),
  );
});

const parseFeed = (xml: string) =>
  Effect.try({
    try: () => parser.parse(xml, true) as unknown,
    catch: (cause) =>
      new LetterboxdError({
        message: "Couldn't parse the feed",
        retryable: false,
        cause,
      }),
  }).pipe(
    Effect.flatMap(decodeFeed),
    Effect.mapError((cause) =>
      cause._tag === "LetterboxdError"
        ? cause
        : new LetterboxdError({
            message: `Unexpected feed: ${cause.message}`,
            retryable: false,
            cause,
          }),
    ),
  );

/**
 * My diary from the RSS feed at `letterboxd.com/{user}/rss/`: films rated,
 * and reviews. Lists are in the feed too, after the diary, but left out.
 *
 * The feed is my last 50 diary entries, newest logged first, so a busy month
 * could push some out while they're still in the retention window. Each
 * snapshot is complete back to the oldest entry in the feed
 * (`completeAfter`): deleted entries since then are removed, and older ones
 * are kept.
 *
 * There's no `ETag`, so the checkpoint is a hash of the feed: an unchanged
 * feed is still downloaded, but doesn't rewrite the rows.
 */
export const makeLetterboxdDiarySource = Effect.fn("makeLetterboxdDiarySource")(
  function* (options: { readonly user: string }) {
    const client = yield* HttpClient.HttpClient;
    const { user } = options;
    const url = `https://letterboxd.com/${encodeURIComponent(user)}/rss/`;

    const snapshot = ({
      since,
      checkpoint,
    }: {
      readonly since: number;
      readonly checkpoint: string | undefined;
    }) =>
      Effect.gen(function* () {
        const xml = yield* fetchFeed(url).pipe(retryTransient);
        const hash = createHash("sha256").update(xml).digest("base64url");
        if (hash === checkpoint) {
          return SnapshotResult.unchanged(REFRESH_INTERVAL);
        }

        const feed = yield* parseFeed(xml);
        const activities: Array<Activity> = [];
        let oldest: number | undefined;
        for (const item of feed.rss.channel.item ?? []) {
          const entry = decodeItem(item);
          if (Exit.isFailure(entry)) {
            yield* Effect.logWarning("Skipping invalid feed item", entry.cause);
            continue;
          }
          if (!("link" in entry.value)) continue;
          const loggedAt = Date.parse(entry.value.pubDate);
          if (loggedAt < (oldest ?? Infinity)) oldest = loggedAt;
          const activity = toActivity(entry.value);
          if (activity === undefined || activity.timestamp < since) continue;
          if (isServed(activity)) {
            activities.push(activity);
          } else {
            yield* Effect.logWarning(
              "Skipping diary entry that doesn't match its schema",
            ).pipe(Effect.annotateLogs({ id: activity.id }));
          }
        }
        return SnapshotResult.snapshot(
          activities,
          hash,
          REFRESH_INTERVAL,
          // The feed has every entry since its oldest. With none, it says
          // nothing about what's stored.
          oldest ?? (yield* Clock.currentTimeMillis),
        );
      }).pipe(
        Effect.mapError(
          (cause) =>
            new SourceError({
              source: "letterboxd",
              message: cause.message,
              retryAt: cause.retryAt,
              cause,
            }),
        ),
        Effect.provideService(HttpClient.HttpClient, client),
        Effect.withSpan("LetterboxdDiary.snapshot"),
      );

    return {
      name: "letterboxd",
      fingerprint: [`user=${user}`, `version=${VERSION}`].join(";"),
      snapshot,
    } satisfies Source;
  },
);
