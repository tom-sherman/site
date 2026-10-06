import {
  Clock,
  Context,
  Effect,
  Exit,
  Layer,
  Schema,
  Semaphore,
  Stream,
} from "effect";
import { type Activity, Mutation, RETENTION_MS } from "./Activity.ts";
import type { SourceError } from "./Source.ts";
import { Sources } from "./Source.ts";
import { type Generation, type PageQuery, Store } from "./Store.ts";

/** No generation has finished building yet (first ever boot). */
export class CacheNotReady extends Schema.TaggedError<CacheNotReady>()(
  "CacheNotReady",
  {},
) {}

export interface CacheStatus {
  readonly live: Generation | undefined;
  readonly building: Generation | undefined;
}

/**
 * Owns which generation is live and routes writes to it.
 *
 * Rebuilds write every source's backfill into a fresh generation while the
 * live one keeps serving reads and taking realtime writes. Realtime mutations
 * that arrive during the rebuild are also buffered for the new generation and
 * replayed on top of the backfill before the swap. Buffering starts before any
 * backfill request is sent, so every change is either in the snapshot or in
 * the buffer (or both: replaying upserts/deletes in order is idempotent).
 */
export class ActivityCache extends Context.Service<
  ActivityCache,
  {
    /** Entry point for realtime sources. */
    readonly apply: (mutations: ReadonlyArray<Mutation>) => Effect.Effect<void>;
    /** Rebuilds from every source's backfill, then swaps. Concurrent calls queue up. */
    readonly rebuild: Effect.Effect<void, SourceError>;
    readonly query: (
      query: PageQuery,
    ) => Effect.Effect<ReadonlyArray<Activity>, CacheNotReady>;
    /** Drops live activity older than the retention window. */
    readonly prune: Effect.Effect<void>;
    readonly status: Effect.Effect<CacheStatus>;
  }
>()("activity-cache/ActivityCache") {
  static readonly layer = Layer.effect(
    ActivityCache,
    Effect.gen(function* () {
      const store = yield* Store;
      const sources = yield* Sources;

      // Guards `live`, `building` and the tables they point at, so a query or
      // write never races a swap that drops its table.
      const lock = yield* Semaphore.make(1);
      const rebuildLock = yield* Semaphore.make(1);

      yield* store.dropInactiveGenerations;
      let live = yield* store.activeGeneration;
      let building:
        | { readonly generation: Generation; readonly buffer: Array<Mutation> }
        | undefined;

      const apply = (mutations: ReadonlyArray<Mutation>) =>
        lock.withPermit(
          Effect.gen(function* () {
            building?.buffer.push(...mutations);
            if (live !== undefined) yield* store.write(live, mutations);
          }),
        );

      const backfillInto = (generation: Generation) =>
        Effect.gen(function* () {
          const since = (yield* Clock.currentTimeMillis) - RETENTION_MS;
          yield* Stream.fromIterable(sources).pipe(
            Stream.flatMap((source) => source.backfill(since)),
            Stream.grouped(500),
            Stream.runForEach((batch) =>
              store.write(generation, batch.map(Mutation.upsert)),
            ),
          );
        });

      const swapTo = (generation: Generation) =>
        lock.withPermit(
          Effect.gen(function* () {
            yield* store.write(generation, building?.buffer ?? []);
            yield* store.activateGeneration(generation);
            const previous = live;
            live = generation;
            building = undefined;
            if (previous !== undefined) yield* store.dropGeneration(previous);
          }),
        );

      const abandon = (generation: Generation) =>
        lock.withPermit(
          Effect.gen(function* () {
            building = undefined;
            yield* store.dropGeneration(generation);
          }),
        );

      const rebuild = rebuildLock
        .withPermit(
          Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const generation = yield* store.createGeneration;
              yield* lock.withPermit(
                Effect.sync(() => {
                  building = { generation, buffer: [] };
                }),
              );
              yield* Effect.logInfo("Rebuilding").pipe(
                Effect.annotateLogs({ generation }),
              );
              yield* restore(backfillInto(generation)).pipe(
                Effect.onExit((exit) =>
                  Exit.isSuccess(exit)
                    ? swapTo(generation)
                    : abandon(generation),
                ),
              );
              yield* Effect.logInfo("Rebuilt").pipe(
                Effect.annotateLogs({ generation }),
              );
            }),
          ),
        )
        .pipe(Effect.withSpan("ActivityCache.rebuild"));

      const query = (pageQuery: PageQuery) =>
        lock.withPermit(
          Effect.suspend(() =>
            live === undefined
              ? Effect.fail(new CacheNotReady())
              : store.query(live, pageQuery),
          ),
        );

      const prune = lock.withPermit(
        Effect.gen(function* () {
          if (live === undefined) return;
          const now = yield* Clock.currentTimeMillis;
          const removed = yield* store.prune(live, now - RETENTION_MS);
          if (removed > 0) yield* Effect.logDebug(`Pruned ${removed} rows`);
        }),
      );

      const status = Effect.sync((): CacheStatus => ({
        live,
        building: building?.generation,
      }));

      return ActivityCache.of({ apply, rebuild, query, prune, status });
    }),
  );
}
