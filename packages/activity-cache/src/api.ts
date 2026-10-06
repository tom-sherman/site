import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
} from "effect/http-api";
import { Activity } from "./Activity.ts";

export { Activity };

export const ActivityPage = Schema.Struct({
  /** Newest first. */
  items: Schema.Array(Activity),
  /** Pass as `before` to get the next (older) page; `null` on the last page. */
  cursor: Schema.NullOr(Schema.String),
});
export type ActivityPage = typeof ActivityPage.Type;

export const CacheStatus = Schema.Struct({
  live: Schema.NullOr(Schema.Int),
  building: Schema.NullOr(Schema.Int),
});

export class ActivityApi extends HttpApi.make("activity-cache").add(
  HttpApiGroup.make("activity")
    .add(
      HttpApiEndpoint.get("list", "/activity", {
        query: {
          limit: Schema.optional(
            Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 500 })),
          ),
          before: Schema.optional(Schema.String),
          /** Repeat to filter by several types. */
          type: Schema.optional(Schema.ArrayEnsure(Schema.String)),
        },
        success: ActivityPage,
        error: [HttpApiError.BadRequest, HttpApiError.ServiceUnavailable],
      }),
    )
    .add(HttpApiEndpoint.get("status", "/status", { success: CacheStatus })),
) {}
