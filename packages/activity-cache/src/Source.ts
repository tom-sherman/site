import { Context, Schema, type Stream } from "effect";
import type { Activity } from "./Activity.ts";

export class SourceError extends Schema.TaggedError<SourceError>()(
  "SourceError",
  {
    source: Schema.String,
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

/**
 * Somewhere activity comes from. `backfill` is a full snapshot of everything
 * since a point in time; it must be safe to run while realtime mutations for
 * the same source are flowing (see `ActivityCache.rebuild`).
 */
export interface Source {
  readonly name: string;
  readonly backfill: (since: number) => Stream.Stream<Activity, SourceError>;
}

export class Sources extends Context.Service<Sources, ReadonlyArray<Source>>()(
  "activity-cache/Sources",
) {}
