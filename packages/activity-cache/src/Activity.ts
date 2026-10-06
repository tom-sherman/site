import { Schema } from "effect";

/** One cached activity. Everything source-specific lives in `data`. */
export const Activity = Schema.Struct({
  /** Stable key, so realtime updates and deletes can find the row (an at-uri for atproto records). */
  id: Schema.String,
  /** Epoch milliseconds. */
  timestamp: Schema.Int,
  /** What `data` is, e.g. an NSID like `app.bsky.feed.post`. */
  type: Schema.String,
  data: Schema.Json,
});
export type Activity = typeof Activity.Type;

/** A write to the cache, as produced by realtime sources. */
export type Mutation =
  | { readonly _tag: "Upsert"; readonly activity: Activity }
  | { readonly _tag: "Delete"; readonly id: string };

export const Mutation = {
  upsert: (activity: Activity): Mutation => ({ _tag: "Upsert", activity }),
  delete: (id: string): Mutation => ({ _tag: "Delete", id }),
};

/** Only this much history is kept. */
export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
