import { Effect, Layer } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/http-api";
import { ActivityCache } from "./ActivityCache.ts";
import { ActivityApi } from "./api.ts";
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
        const items = yield* cache
          .query({ limit, before, types: query.type })
          .pipe(
            Effect.catchTag("CacheNotReady", () =>
              Effect.fail(new HttpApiError.ServiceUnavailable()),
            ),
          );
        const last = items.at(-1);
        return {
          items,
          cursor: items.length === limit && last ? encodeCursor(last) : null,
        };
      }),
      status: () =>
        cache.status.pipe(
          Effect.map(({ live, building }) => ({
            live: live ?? null,
            building: building ?? null,
          })),
        ),
    });
  }),
);

export const HttpLayer = HttpApiBuilder.layer(ActivityApi).pipe(
  Layer.provide(ActivityApiHandlers),
);
