import {
  Context,
  type Duration,
  type Effect,
  Schema,
  type Stream,
} from "effect";
import type { Activity, Mutation } from "./Activity.ts";

export class SourceError extends Schema.TaggedError<SourceError>()(
  "SourceError",
  {
    source: Schema.String,
    message: Schema.String,
    /** When upstream asked us to come back (epoch ms), e.g. from a rate limit response. */
    retryAt: Schema.optional(Schema.Number),
    cause: Schema.Defect(),
  },
) {}

/**
 * `refreshAfter` is when the source wants to be asked again. It's the
 * source's call: a fixed interval for atproto, whatever `X-Poll-Interval`
 * says for GitHub. The cache persists it, so restarts don't move it.
 */
export type SnapshotResult =
  | { readonly _tag: "Unchanged"; readonly refreshAfter: Duration.Input }
  | {
      readonly _tag: "Snapshot";
      readonly activities: ReadonlyArray<Activity>;
      readonly checkpoint: string | undefined;
      readonly refreshAfter: Duration.Input;
    };

export const SnapshotResult = {
  unchanged: (refreshAfter: Duration.Input): SnapshotResult => ({
    _tag: "Unchanged",
    refreshAfter,
  }),
  snapshot: (
    activities: ReadonlyArray<Activity>,
    checkpoint: string | undefined,
    refreshAfter: Duration.Input,
  ): SnapshotResult => ({
    _tag: "Snapshot",
    activities,
    checkpoint,
    refreshAfter,
  }),
};

/**
 * What a realtime source's stream says. `cursor` is opaque to the cache: it's
 * persisted with the change it came with and handed back when the stream is
 * reopened, so a restart resumes where the last process left off.
 */
export type Change =
  | {
      readonly _tag: "Batch";
      /** May be empty: upstream moved on without anything cached changing. */
      readonly mutations: ReadonlyArray<Mutation>;
      readonly cursor: string;
      /**
       * The snapshot checkpoint these mutations bring the rows up to (for
       * atproto, the commit's rev). Keeps cheap "unchanged" checks working
       * while the stream is what keeps the rows fresh.
       */
      readonly checkpoint?: string | undefined;
    }
  | {
      /**
       * Changes may have been missed (a cursor too old to resume from, the
       * repo being reset, a stream started without a cursor), so the rows
       * can't be trusted until the next snapshot, which happens now.
       */
      readonly _tag: "Gap";
      /** Where to resume from, if the stream has moved its position. */
      readonly cursor?: string | undefined;
    };

export const Change = {
  batch: (
    mutations: ReadonlyArray<Mutation>,
    cursor: string,
    checkpoint?: string,
  ): Change => ({ _tag: "Batch", mutations, cursor, checkpoint }),
  gap: (cursor?: string): Change => ({ _tag: "Gap", cursor }),
};

/**
 * Somewhere activity comes from: an atproto repo, GitHub, … Each source's
 * rows are refreshed independently, so one source being down or rate limited
 * doesn't hold up the others.
 */
export interface Source {
  /** Stable key for this source's rows and state. */
  readonly name: string;
  /**
   * Describes the shape of what this source stores (what it fetches and how
   * it maps it). When it changes, the source's rows are rebuilt from scratch.
   */
  readonly fingerprint: string;
  /**
   * Upstream never deletes anything, but stops serving older items (GitHub
   * serves the last 30 days of events, but at most 300). Snapshots are then
   * merged into the stored rows rather than replacing them, so what falls
   * out of upstream's window stays until it's older than the retention
   * window. A rebuild (fingerprint change) still replaces them.
   */
  readonly appendOnly?: boolean | undefined;
  /**
   * Everything since `since`; for an append-only source, everything upstream
   * still serves since then. Given the checkpoint from the last snapshot,
   * a source can cheaply report `Unchanged` instead (a repo rev, an ETag, …).
   * Must be safe to run while realtime mutations for the source are flowing.
   */
  readonly snapshot: (options: {
    readonly since: number;
    readonly checkpoint: string | undefined;
  }) => Effect.Effect<SnapshotResult, SourceError>;
  /**
   * Realtime changes, resuming from `cursor` (the last one the cache
   * persisted). The cache runs this for as long as it runs, and reopens it
   * with the latest cursor if it fails or ends.
   *
   * Opened without a cursor, the stream must start with a `Gap`: whatever
   * happened before it started is only in the next snapshot.
   */
  readonly changes?: (options: {
    readonly cursor: string | undefined;
  }) => Stream.Stream<Change, SourceError>;
}

export class Sources extends Context.Service<Sources, ReadonlyArray<Source>>()(
  "activity-cache/Sources",
) {}
