import {
  getMain,
  lexToJson,
  type InferOutput,
  type Main,
  type RecordSchema,
} from "@atproto/lex";
import { app, fm, is, site } from "@repo/atproto-client";
import { parse } from "@repo/atproto-client/effect";
import { Effect, type Schema } from "effect";
import type { Activity } from "../../Activity.ts";
import { tidTimestamp } from "./tid.ts";

/**
 * How records from one collection become activity. Both backfill and
 * realtime ingestion go through `toActivity`, so they always agree.
 */
export interface CollectionHandler {
  readonly collection: string;
  /** Bump when `toActivity`'s output changes, so stored rows get rebuilt. */
  readonly version: number;
  /** `undefined` means the record isn't activity (or doesn't parse) and is skipped. */
  readonly toActivity: (record: {
    readonly uri: string;
    readonly rkey: string;
    readonly value: unknown;
  }) => Effect.Effect<Activity | undefined>;
}

/**
 * A collection cached as-is: `type` is the NSID and `data` is the record as
 * JSON. `timestamp` picks the record's own date; the TID rkey is the fallback.
 * `rollup` sets the activity's `group` and `collects`. `include` leaves out
 * records that aren't activity.
 */
export const recordCollection = <S extends RecordSchema>(
  schema: Main<S>,
  options: {
    readonly timestamp: (record: InferOutput<S>) => string | undefined;
    readonly rollup?: (
      record: InferOutput<S>,
      uri: string,
    ) => Pick<Activity, "group" | "collects">;
    readonly include?: (record: InferOutput<S>, uri: string) => boolean;
    /** See `CollectionHandler.version`. */
    readonly version?: number;
  },
): CollectionHandler => {
  const collection = getMain(schema).$type;
  return {
    collection,
    version: options.version ?? 1,
    toActivity: ({ uri, rkey, value }) =>
      parse(schema, value).pipe(
        Effect.map((record): Activity | undefined => {
          if (options.include && !options.include(record, uri)) {
            return undefined;
          }
          const timestamp =
            Date.parse(options.timestamp(record) ?? "") || tidTimestamp(rkey);
          if (timestamp === undefined) return undefined;
          return {
            id: uri,
            timestamp,
            type: collection,
            data: lexToJson(record) as Schema.Json,
            ...options.rollup?.(record, uri),
          };
        }),
        Effect.catchTag("LexParseError", (error) =>
          Effect.logWarning("Skipping invalid record", error.message).pipe(
            Effect.annotateLogs({ uri }),
            Effect.as(undefined),
          ),
        ),
      ),
  };
};

/** The DID (or handle) in an at-uri. */
const authority = (uri: string) => uri.split("/")[2];

/**
 * The thread a post is part of, keyed by the thread's root post. Like
 * Bluesky's own author threads, a reply only counts when its root and parent
 * are both the author's, so replies to other people are left out. Every
 * top-level post is the root of a (possibly one-post) thread.
 */
const threadOf = (post: app.bsky.feed.post.Main, uri: string) => {
  if (!post.reply) return uri;
  const author = authority(uri);
  return authority(post.reply.root.uri) === author &&
    authority(post.reply.parent.uri) === author
    ? post.reply.root.uri
    : undefined;
};

/**
 * The thread a document publishes as writing: the first post its content
 * points at, when that's a post in the document's own repo. Anything else
 * (a blog post) isn't activity.
 */
const threadRootOf = (doc: site.standard.document.Main, uri: string) => {
  const ref = is.sherman.unspecced.documentref.$safeParse(doc.content);
  if (!ref.success) return undefined;
  const [, , repo, collection] = ref.value.uri.split("/");
  return repo === authority(uri) && collection === "app.bsky.feed.post"
    ? ref.value.uri
    : undefined;
};

/**
 * Everything cached from the atproto repo. Adding or removing a collection
 * (after `pnpm lex:install`-ing it in atproto-client), or bumping a
 * `version`, changes the source's fingerprint, so its rows are rebuilt on
 * the next boot.
 */
export const collections: ReadonlyArray<CollectionHandler> = [
  recordCollection(app.bsky.feed.post, {
    timestamp: (r) => r.createdAt,
    rollup: (post, uri) => ({ group: threadOf(post, uri) }),
    version: 2,
  }),
  // A thread published as writing: it's served as one item, posts included.
  recordCollection(site.standard.document, {
    timestamp: (r) => r.publishedAt,
    include: (doc, uri) => threadRootOf(doc, uri) !== undefined,
    rollup: (doc, uri) => ({ collects: threadRootOf(doc, uri) }),
  }),
  recordCollection(app.bsky.feed.like, { timestamp: (r) => r.createdAt }),
  recordCollection(app.bsky.feed.repost, { timestamp: (r) => r.createdAt }),
  recordCollection(app.bsky.graph.follow, { timestamp: (r) => r.createdAt }),
  recordCollection(fm.teal.feed.play, { timestamp: (r) => r.playedTime }),
];
