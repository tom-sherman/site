import {
  getMain,
  lexToJson,
  type InferOutput,
  type Main,
  type RecordSchema,
} from "@atproto/lex";
import { app, fm } from "@repo/atproto-client";
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
 */
export const recordCollection = <S extends RecordSchema>(
  schema: Main<S>,
  options: {
    readonly timestamp: (record: InferOutput<S>) => string | undefined;
  },
): CollectionHandler => {
  const collection = getMain(schema).$type;
  return {
    collection,
    toActivity: ({ uri, rkey, value }) =>
      parse(schema, value).pipe(
        Effect.map((record): Activity | undefined => {
          const timestamp =
            Date.parse(options.timestamp(record) ?? "") || tidTimestamp(rkey);
          if (timestamp === undefined) return undefined;
          return {
            id: uri,
            timestamp,
            type: collection,
            data: lexToJson(record) as Schema.Json,
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

/**
 * Everything cached from the atproto repo. Add a collection here (after
 * `pnpm lex:install`-ing it in atproto-client) and the next rebuild, which
 * runs on every boot, picks it up.
 */
export const collections: ReadonlyArray<CollectionHandler> = [
  recordCollection(app.bsky.feed.post, { timestamp: (r) => r.createdAt }),
  recordCollection(fm.teal.feed.play, { timestamp: (r) => r.playedTime }),
];
