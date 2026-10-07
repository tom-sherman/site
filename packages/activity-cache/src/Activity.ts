import { Schema } from "effect";

const fields = {
  /** Stable key, so realtime updates and deletes can find the row (an at-uri for atproto records). */
  id: Schema.String,
  /** Epoch milliseconds. */
  timestamp: Schema.Int,
  /** What `data` is, e.g. an NSID like `app.bsky.feed.post`. */
  type: Schema.String,
  data: Schema.Json,
};

/**
 * One activity as served. Everything source-specific lives in `data`.
 *
 * A roll-up (see `Activity.collects`) is served in place of the activities
 * it rolls up, which are in `members` instead of in the feed.
 */
export const ActivityItem = Schema.Struct({
  ...fields,
  /** Oldest first. Only set on roll-ups. */
  members: Schema.optional(Schema.Array(Schema.Struct(fields))),
});
export type ActivityItem = typeof ActivityItem.Type;

/** One cached activity, as sources produce it. */
export interface Activity {
  readonly id: string;
  readonly timestamp: number;
  readonly type: string;
  readonly data: Schema.Json;
  /**
   * The group this activity belongs to, keyed by the id of the group's first
   * activity; for a post in a thread, that's the thread's root post. A group
   * shows as its separate activities unless something `collects` it.
   */
  readonly group?: string | undefined;
  /**
   * Rolls up the group with this key: the group's activities are served as
   * this activity's `members` instead of on their own, and this activity
   * takes the place, and timestamp, of the group's first activity.
   *
   * Only within one source. Until the first activity is cached (or after it's
   * deleted or pruned), the roll-up is hidden and the group shows as usual. If
   * several activities collect one group, the one with the lowest id wins.
   */
  readonly collects?: string | undefined;
}

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
