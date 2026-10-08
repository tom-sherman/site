import { Effect, Layer, Schema } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/http-api";
import { ActivityCache } from "./ActivityCache.ts";
import type { FeedEntry } from "./Activity.ts";
import { ActivityApi, ActivityItem, Authorization } from "./api.ts";
import { OidcVerifier } from "./oidc/OidcVerifier.ts";
import type { PageCursor } from "./Store.ts";

const DEFAULT_LIMIT = 50;

// Cursors are `<timestamp>:<id>`; ids are at-uris and contain colons, timestamps don't.
const encodeCursor = (cursor: PageCursor) => `${cursor.timestamp}:${cursor.id}`;
const decodeCursor = (cursor: string): PageCursor | undefined => {
  const separator = cursor.indexOf(":");
  const timestamp = Number(cursor.slice(0, separator));
  if (separator < 1 || !Number.isSafeInteger(timestamp)) return undefined;
  return { timestamp, id: cursor.slice(separator + 1) };
};

const decodeItem = Schema.decodeUnknownEffect(ActivityItem);

/**
 * Sources only store what the API serves, so this only fails on a bug, or a
 * schema change without a source version bump. One bad entry shouldn't take
 * the feed down, so it's logged and left out.
 */
const toItems = (entry: FeedEntry) =>
  decodeItem(entry).pipe(
    Effect.map((item) => [item]),
    Effect.catch((error) =>
      Effect.logWarning(
        "Leaving out an entry the API can't serve",
        error.message,
      ).pipe(
        Effect.annotateLogs({ id: entry.id, type: entry.type }),
        Effect.as([]),
      ),
    ),
  );

export const ActivityApiHandlers = HttpApiBuilder.group(
  ActivityApi,
  "activity",
  Effect.fn(function* (handlers) {
    const cache = yield* ActivityCache;
    return handlers.handleAll({
      list: Effect.fn(function* ({ query }) {
        const limit = query.limit ?? DEFAULT_LIMIT;
        const before =
          query.before === undefined ? undefined : decodeCursor(query.before);
        if (query.before !== undefined && before === undefined) {
          return yield* new HttpApiError.BadRequest();
        }
        const entries = yield* cache.query({
          limit,
          before,
          types: query.type,
        });
        const items = yield* Effect.forEach(entries, toItems);
        // From the entries, so a page with an entry left out still pages on.
        const last = entries.at(-1);
        return {
          items: items.flat(),
          cursor: entries.length === limit && last ? encodeCursor(last) : null,
        };
      }),
    });
  }),
);

export const SystemApiHandlers = HttpApiBuilder.group(
  ActivityApi,
  "system",
  Effect.fn(function* (handlers) {
    const cache = yield* ActivityCache;
    return handlers.handleAll({
      status: () =>
        cache.status.pipe(
          Effect.map((sources) => ({
            sources: sources.map((s) => ({
              source: s.source,
              upToDate: s.upToDate,
              refreshing: s.refreshing,
              refreshedAt: s.refreshedAt,
              nextAttemptAt: s.nextAttemptAt > 0 ? s.nextAttemptAt : null,
              failures: s.failures,
            })),
          })),
        ),
    });
  }),
);

export const AuthorizationLayer = Layer.effect(
  Authorization,
  Effect.gen(function* () {
    const verifier = yield* OidcVerifier;
    return Authorization.of({
      bearer: (httpEffect, { credential }) =>
        verifier.verify(credential).pipe(
          Effect.catchTags({
            InvalidAccessToken: (error) =>
              Effect.logInfo("Rejected access token", error.message).pipe(
                Effect.andThen(Effect.fail(new HttpApiError.Unauthorized())),
              ),
            IssuerUnavailable: (error) =>
              Effect.logWarning(error.message).pipe(
                Effect.andThen(
                  Effect.fail(new HttpApiError.ServiceUnavailable()),
                ),
              ),
          }),
          Effect.andThen(httpEffect),
        ),
    });
  }),
);

export const HttpLayer = HttpApiBuilder.layer(ActivityApi).pipe(
  Layer.provide([
    ActivityApiHandlers.pipe(Layer.provide(AuthorizationLayer)),
    SystemApiHandlers,
  ]),
);
