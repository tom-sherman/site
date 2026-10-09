import {
  Clock,
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  Queue,
  Schedule,
  Semaphore,
} from "effect";
import { type FeedEntry, type Mutation, RETENTION_MS } from "./Activity.ts";
import {
  type Change,
  CursorStore,
  type Source,
  type SourceError,
  Sources,
} from "./Source.ts";
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
 * A snapshot that only goes back so far (`completeAfter`) only replaces the
 * rows it covers, so what falls out of upstream's window is kept until
 * retention prunes it.
 *
 * While a source's snapshot is being fetched, its rows keep serving reads and
 * taking realtime writes. Those writes are also buffered and replayed on top
 * of the snapshot when it's swapped in, in one transaction. Buffering starts
 * before the snapshot is requested, so every change is in the snapshot, the
 * buffer, or both (replaying upserts/deletes in order is idempotent).
 *
 * Realtime sources are followed for as long as the cache runs: they hand
 * each change to the cache to write, and keep their own cursor
 * (`CursorStore`), saved once what came before it is written. A `Gap` marks
 * the rows stale (so the next refresh is a rebuild) and wakes the source's
 * scheduler. A gap during a refresh taints it: its snapshot may predate what
 * was missed, so it's swapped in but the source stays stale and refreshes
 * again.
 */
export class ActivityCache extends Context.Service<
  ActivityCache,
  {
    /**
     * Writes realtime mutations, buffered across a refresh like a stream's.
     * Realtime sources go through `Source.changes` instead.
     */
    readonly apply: (
      source: string,
      mutations: ReadonlyArray<Mutation>,
    ) => Effect.Effect<void>;
    /** Refreshes one source now, ignoring its schedule (but not concurrent refreshes). */
    readonly refresh: (source: string) => Effect.Effect<void, SourceError>;
    /** Keeps every source fresh and prunes old rows. Runs forever. */
    readonly run: Effect.Effect<never>;
    /** Newest first, with roll-ups in place of the activities they collect. */
    readonly query: (
      query: PageQuery,
    ) => Effect.Effect<ReadonlyArray<FeedEntry>>;
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
      /** Per refresh in progress: realtime writes since it started, and whether a gap happened. */
      const buffers = new Map<
        string,
        { mutations: Array<Mutation>; tainted: boolean }
      >();
      const refreshLocks = new Map(
        sources.map((s) => [s.name, Semaphore.makeUnsafe(1)]),
      );
      /** Cuts a source's scheduler sleep short, e.g. after a gap. */
      const wakeups = new Map(
        yield* Effect.forEach(sources, (s) =>
          Queue.sliding<void>(1).pipe(Effect.map((q) => [s.name, q] as const)),
        ),
      );

      const apply = (source: string, mutations: ReadonlyArray<Mutation>) =>
        lock.withPermit(
          Effect.gen(function* () {
            buffers.get(source)?.mutations.push(...mutations);
            yield* store.write(source, mutations);
          }),
        );

      const applyChange = (source: string, change: Change) =>
        lock.withPermit(
          Effect.gen(function* () {
            const buffer = buffers.get(source);
            if (change._tag === "Batch") {
              buffer?.mutations.push(...change.mutations);
              yield* store.write(source, change.mutations, change.checkpoint);
              return;
            }
            if (buffer) buffer.tainted = true;
            yield* store.markStale(source);
            Queue.offerUnsafe(wakeups.get(source)!, undefined);
            yield* Effect.logInfo("Changes may have been missed; rebuilding");
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
              Effect.sync(() =>
                buffers.set(source.name, { mutations: [], tainted: false }),
              ),
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
            const tainted = yield* lock.withPermit(
              Effect.gen(function* () {
                const buffer = buffers.get(source.name);
                buffers.delete(source.name);
                const tainted = buffer?.tainted ?? false;
                if (result._tag === "Unchanged") {
                  // A gap already marked the source stale, which this leaves be.
                  yield* store.recordUnchanged(source.name, {
                    refreshedAt,
                    nextRefreshAt,
                  });
                } else {
                  yield* store.replaceSource(source.name, {
                    activities: result.activities,
                    // A rebuild can't keep rows built with the old fingerprint.
                    keepUpTo: rebuild ? undefined : result.completeAfter,
                    mutations: buffer?.mutations ?? [],
                    fingerprint: tainted ? null : fingerprint,
                    checkpoint: tainted ? undefined : result.checkpoint,
                    refreshedAt,
                    nextRefreshAt,
                  });
                }
                return tainted;
              }),
            );
            yield* Effect.logInfo(
              result._tag === "Unchanged"
                ? "Unchanged"
                : `${rebuild ? "Rebuilt" : "Refreshed"} with ${result.activities.length} activities`,
            );
            if (tainted) {
              yield* Effect.logInfo(
                "Changes may have been missed during the refresh; rebuilding",
              );
            }
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
              yield* Effect.raceFirst(
                Effect.sleep(due - now),
                Queue.take(wakeups.get(source.name)!),
              );
              continue;
            }
            yield* refresh(source.name).pipe(
              Effect.catch((error) => Effect.logWarning(error.message)),
            );
          }
        }).pipe(Effect.annotateLogs({ source: source.name }));

      /**
       * Runs a realtime source's `follow`, again whenever it fails (or ends).
       * Sources reconnect by themselves through transient trouble, so what
       * reaches here backs off like a failed refresh, starting over once the
       * source applies something again.
       */
      const follow = (source: Source) =>
        Effect.gen(function* () {
          if (!source.follow) return;
          const cursors = CursorStore.of({
            load: store
              .sourceState(source.name)
              .pipe(Effect.map((state) => state.cursor ?? undefined)),
            save: (cursor) => store.saveCursor(source.name, cursor),
          });
          let failures = 0;
          while (true) {
            const exit = yield* source
              .follow((change) => {
                failures = 0;
                return applyChange(source.name, change);
              })
              .pipe(Effect.provideService(CursorStore, cursors), Effect.exit);
            failures++;
            const wait = backoff(failures);
            yield* Exit.isFailure(exit)
              ? Effect.logWarning(
                  `Following failed; restarting in ${wait / 1000}s`,
                  exit.cause,
                )
              : Effect.logWarning(
                  `Following ended; restarting in ${wait / 1000}s`,
                );
            yield* Effect.sleep(wait);
          }
        }).pipe(Effect.annotateLogs({ source: source.name }));

      const prune = Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const removed = yield* store.prune(now - RETENTION_MS);
        if (removed > 0) yield* Effect.logDebug(`Pruned ${removed} rows`);
      });

      const run = Effect.all(
        [
          ...sources.map(follow),
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
