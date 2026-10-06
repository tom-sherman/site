import {
  Clock,
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  Schedule,
  Semaphore,
} from "effect";
import { type Activity, type Mutation, RETENTION_MS } from "./Activity.ts";
import { type Source, type SourceError, Sources } from "./Source.ts";
import { type PageQuery, type SourceState, Store } from "./Store.ts";

export interface SourceStatus extends SourceState {
  /** The stored rows were built with the current fingerprint. */
  readonly upToDate: boolean;
  readonly refreshing: boolean;
}

/** Backoff after `failures` consecutive failed attempts: 30s, 1m, 2m, … up to 1h. */
export const backoff = (failures: number): number =>
  Math.min(30_000 * 2 ** Math.max(0, failures - 1), 60 * 60_000);

/** Retention is part of every fingerprint: widening it needs a refetch. */
const fingerprintOf = (source: Source) =>
  `${source.fingerprint};retention=${RETENTION_MS}`;

/**
 * Owns the cached rows and keeps each source fresh.
 *
 * Every source refreshes on its own schedule, persisted in SQLite so restarts
 * don't trigger refetches: a source is only rebuilt when its fingerprint
 * changes, refreshed when it last asked to be (`refreshAfter`), and backed
 * off after failures. Each attempt is recorded before upstream is called, so
 * a process that crashes mid-refresh comes back to a backoff rather than
 * hitting upstream again immediately.
 *
 * While a source's snapshot is being fetched, its rows keep serving reads and
 * taking realtime writes. Those writes are also buffered and replayed on top
 * of the snapshot when it's swapped in, in one transaction. Buffering starts
 * before the snapshot is requested, so every change is in the snapshot, the
 * buffer, or both (replaying upserts/deletes in order is idempotent).
 */
export class ActivityCache extends Context.Service<
  ActivityCache,
  {
    /** Entry point for realtime sources. */
    readonly apply: (
      source: string,
      mutations: ReadonlyArray<Mutation>,
    ) => Effect.Effect<void>;
    /** Refreshes one source now, ignoring its schedule (but not concurrent refreshes). */
    readonly refresh: (source: string) => Effect.Effect<void, SourceError>;
    /** Keeps every source fresh and prunes old rows. Runs forever. */
    readonly run: Effect.Effect<never>;
    readonly query: (
      query: PageQuery,
    ) => Effect.Effect<ReadonlyArray<Activity>>;
    /** Drops activity older than the retention window. */
    readonly prune: Effect.Effect<void>;
    readonly status: Effect.Effect<ReadonlyArray<SourceStatus>>;
  }
>()("activity-cache/ActivityCache") {
  static readonly layer = Layer.effect(
    ActivityCache,
    Effect.gen(function* () {
      const store = yield* Store;
      const sources = yield* Sources;
      const byName = new Map(sources.map((s) => [s.name, s]));

      yield* store.dropSourcesExcept([...byName.keys()]);

      // Guards `buffers`, so a realtime write can't slip between a snapshot
      // being swapped in and its buffer being dropped.
      const lock = yield* Semaphore.make(1);
      const buffers = new Map<string, Array<Mutation>>();
      const refreshLocks = new Map(
        sources.map((s) => [s.name, Semaphore.makeUnsafe(1)]),
      );

      const apply = (source: string, mutations: ReadonlyArray<Mutation>) =>
        lock.withPermit(
          Effect.gen(function* () {
            buffers.get(source)?.push(...mutations);
            yield* store.write(source, mutations);
          }),
        );

      const refreshSource = (source: Source) =>
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const state = yield* store.sourceState(source.name);
            const fingerprint = fingerprintOf(source);
            const rebuild = state.fingerprint !== fingerprint;
            const startedAt = yield* Clock.currentTimeMillis;

            const failures = state.failures + 1;
            yield* store.recordAttempt(source.name, {
              failures,
              nextAttemptAt: startedAt + backoff(failures),
            });
            yield* lock.withPermit(
              Effect.sync(() => buffers.set(source.name, [])),
            );

            const result = yield* restore(
              source.snapshot({
                since: startedAt - RETENTION_MS,
                checkpoint: rebuild
                  ? undefined
                  : (state.checkpoint ?? undefined),
              }),
            ).pipe(
              Effect.onExit((exit) =>
                Exit.isSuccess(exit)
                  ? Effect.void
                  : lock.withPermit(
                      Effect.sync(() => buffers.delete(source.name)),
                    ),
              ),
              Effect.tapError((error) =>
                error.retryAt === undefined
                  ? Effect.void
                  : store.deferAttempt(source.name, error.retryAt),
              ),
            );

            if (result._tag === "Unchanged" && rebuild) {
              return yield* Effect.die(
                new Error(
                  `${source.name} returned Unchanged without a checkpoint`,
                ),
              );
            }

            const refreshedAt = yield* Clock.currentTimeMillis;

            const nextRefreshAt =
              refreshedAt +
              Duration.toMillis(Duration.fromInputUnsafe(result.refreshAfter));
            yield* lock.withPermit(
              Effect.gen(function* () {
                const mutations = buffers.get(source.name) ?? [];
                buffers.delete(source.name);
                if (result._tag === "Unchanged") {
                  yield* store.recordUnchanged(source.name, {
                    refreshedAt,
                    nextRefreshAt,
                  });
                } else {
                  yield* store.replaceSource(source.name, {
                    activities: result.activities,
                    mutations,
                    fingerprint,
                    checkpoint: result.checkpoint,
                    refreshedAt,
                    nextRefreshAt,
                  });
                }
              }),
            );
            yield* Effect.logInfo(
              result._tag === "Unchanged"
                ? "Unchanged"
                : `${rebuild ? "Rebuilt" : "Refreshed"} with ${result.activities.length} activities`,
            );
          }),
        ).pipe(
          Effect.annotateLogs({ source: source.name }),
          Effect.withSpan("ActivityCache.refresh", {
            attributes: { source: source.name },
          }),
        );

      const refresh = (name: string) => {
        const source = byName.get(name);
        if (!source) return Effect.die(new Error(`Unknown source ${name}`));
        return refreshLocks.get(name)!.withPermit(refreshSource(source));
      };

      /** When the source should next be refreshed, from its persisted state. */
      const dueAt = (source: Source, state: SourceState, now: number) => {
        const scheduled =
          state.fingerprint === fingerprintOf(source) &&
          state.nextRefreshAt !== null
            ? state.nextRefreshAt
            : now;
        return Math.max(scheduled, state.nextAttemptAt);
      };

      const keepFresh = (source: Source) =>
        Effect.gen(function* () {
          while (true) {
            const state = yield* store.sourceState(source.name);
            const now = yield* Clock.currentTimeMillis;
            const due = dueAt(source, state, now);
            if (due > now) {
              if (state.failures > 0 && state.nextAttemptAt > now) {
                yield* Effect.logInfo(
                  `Backing off for ${Math.ceil((due - now) / 1000)}s after ${state.failures} failed attempt(s)`,
                );
              }
              yield* Effect.sleep(due - now);
            }
            yield* refresh(source.name).pipe(
              Effect.catch((error) => Effect.logWarning(error.message)),
            );
          }
        }).pipe(Effect.annotateLogs({ source: source.name }));

      const prune = Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const removed = yield* store.prune(now - RETENTION_MS);
        if (removed > 0) yield* Effect.logDebug(`Pruned ${removed} rows`);
      });

      const run = Effect.all(
        [
          ...sources.map(keepFresh),
          prune.pipe(Effect.repeat(Schedule.spaced("1 hour"))),
        ],
        { concurrency: "unbounded", discard: true },
      ).pipe(Effect.andThen(Effect.never));

      const status = Effect.forEach(sources, (source) =>
        store.sourceState(source.name).pipe(
          Effect.map((state): SourceStatus => ({
            ...state,
            upToDate: state.fingerprint === fingerprintOf(source),
            refreshing: buffers.has(source.name),
          })),
        ),
      );

      const query = (pageQuery: PageQuery) => store.query(pageQuery);

      return ActivityCache.of({ apply, refresh, run, query, prune, status });
    }),
  );
}
