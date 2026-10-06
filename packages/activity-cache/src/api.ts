import { Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiError,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSecurity,
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

export const SourceStatus = Schema.Struct({
  source: Schema.String,
  /** The stored rows were built with the source's current fingerprint. */
  upToDate: Schema.Boolean,
  refreshing: Schema.Boolean,
  /** Epoch ms of the last successful refresh. */
  refreshedAt: Schema.NullOr(Schema.Int),
  /** Epoch ms before which upstream won't be called (backoff / rate limit). */
  nextAttemptAt: Schema.NullOr(Schema.Int),
  /** Consecutive failed attempts. */
  failures: Schema.Int,
});

export const CacheStatus = Schema.Struct({
  sources: Schema.Array(SourceStatus),
});

/**
 * Requests carry an RFC 9068 JWT access token from the site's OpenID provider:
 * `Authorization: Bearer <token>`.
 */
export class Authorization extends HttpApiMiddleware.Service<Authorization>()(
  "activity-cache/Authorization",
  {
    security: { bearer: HttpApiSecurity.bearer },
    error: [HttpApiError.Unauthorized, HttpApiError.ServiceUnavailable],
  },
) {}

export class ActivityApi extends HttpApi.make("activity-cache")
  .add(
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
          error: HttpApiError.BadRequest,
        }),
      )
      .middleware(Authorization),
  )
  .add(
    // Unauthenticated, for health checks.
    HttpApiGroup.make("system").add(
      HttpApiEndpoint.get("status", "/status", { success: CacheStatus }),
    ),
  ) {}
