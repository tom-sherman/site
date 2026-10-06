import { Context, type Duration, type Effect, Schema } from "effect";
import type { Activity } from "./Activity.ts";

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

export type SnapshotResult =
  | { readonly _tag: "Unchanged" }
  | {
      readonly _tag: "Snapshot";
      readonly activities: ReadonlyArray<Activity>;
      readonly checkpoint: string | undefined;
    };

export const SnapshotResult = {
  unchanged: { _tag: "Unchanged" } as SnapshotResult,
  snapshot: (
    activities: ReadonlyArray<Activity>,
    checkpoint: string | undefined,
  ): SnapshotResult => ({ _tag: "Snapshot", activities, checkpoint }),
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
  /** How often to check for changes. */
  readonly refreshInterval: Duration.Duration;
  /**
   * Everything since `since`. Given the checkpoint from the last snapshot,
   * a source can cheaply report `Unchanged` instead (a repo rev, an ETag, …).
   * Must be safe to run while realtime mutations for the source are flowing.
   */
  readonly snapshot: (options: {
    readonly since: number;
    readonly checkpoint: string | undefined;
  }) => Effect.Effect<SnapshotResult, SourceError>;
}

export class Sources extends Context.Service<Sources, ReadonlyArray<Source>>()(
  "activity-cache/Sources",
) {}
