import "server-only";
import { ActivityApi } from "@repo/activity-cache/api";
import { Cause, Effect, Exit } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { required } from "./env";
import { accessToken } from "./oidc";

export type ActivityCacheClient = HttpApiClient.ForApi<typeof ActivityApi>;

/** A typed client for the activity cache. Every request carries a fresh access token. */
const client = Effect.suspend(() =>
  HttpApiClient.make(ActivityApi, {
    baseUrl: required("ACTIVITY_CACHE_URL"),
    transformClient: HttpClient.mapRequestEffect((request) =>
      Effect.promise(() =>
        accessToken(required("ACTIVITY_CACHE_AUDIENCE")),
      ).pipe(
        Effect.map((token) => HttpClientRequest.bearerToken(request, token)),
      ),
    ),
  }),
).pipe(Effect.provide(FetchHttpClient.layer));

/** A failed call to the activity cache. The Effect failure is the `cause`. */
export class ActivityCacheError extends Error {
  override name = "ActivityCacheError";
}

/**
 * Calls the activity cache, e.g.
 * `activityCache((cache) => cache.activity.list({ query: { limit: 50 } }))`.
 * Responses are decoded against the cache's schemas.
 *
 * Failures reject with an `ActivityCacheError` rather than Effect's own error
 * classes, whose read-only `message` breaks Next's error handling.
 */
export const activityCache = async <A, E>(
  f: (client: ActivityCacheClient) => Effect.Effect<A, E>,
): Promise<A> => {
  const exit = await Effect.runPromiseExit(Effect.flatMap(client, f));
  if (Exit.isSuccess(exit)) return exit.value;
  const cause = Cause.squash(exit.cause);
  throw new ActivityCacheError(
    cause instanceof Error ? cause.message : "Activity cache request failed",
    { cause },
  );
};
