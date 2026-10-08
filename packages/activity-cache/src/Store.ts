import { Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import type { Activity, ActivityItem, Mutation } from "./Activity.ts";

export interface PageCursor {
  readonly timestamp: number;
  readonly id: string;
}

export interface PageQuery {
  readonly limit: number;
  /** Only return activity strictly older than this. */
  readonly before?: PageCursor | undefined;
  readonly types?: ReadonlyArray<string> | undefined;
}

/** What's known about a source's rows. Survives restarts. */
export interface SourceState {
  readonly source: string;
  /** Fingerprint the stored rows were built with; `null` if never built. */
  readonly fingerprint: string | null;
  /** Last successful refresh (a snapshot or an "unchanged" check). */
  readonly refreshedAt: number | null;
  /** When the source asked to be refreshed next (epoch ms); `null` if never refreshed. */
  readonly nextRefreshAt: number | null;
  readonly checkpoint: string | null;
  /** No upstream calls before this (epoch ms). */
  readonly nextAttemptAt: number;
  /** Attempts since the last success, counting one in progress. */
  readonly failures: number;
}

const rowFields = {
  source: Schema.String,
  id: Schema.String,
  timestamp: Schema.Int,
  type: Schema.String,
  data: Schema.fromJsonString(Schema.Json),
};
/** A feed entry; `rollup` is the group a roll-up collects. */
const FeedRow = Schema.Struct({
  ...rowFields,
  rollup: Schema.NullOr(Schema.String),
});
const decodeFeedRows = Schema.decodeUnknownEffect(Schema.Array(FeedRow));
const MemberRow = Schema.Struct({ ...rowFields, group_id: Schema.String });
const decodeMemberRows = Schema.decodeUnknownEffect(Schema.Array(MemberRow));

const StateRow = Schema.Struct({
  source: Schema.String,
  fingerprint: Schema.NullOr(Schema.String),
  refreshed_at: Schema.NullOr(Schema.Int),
  next_refresh_at: Schema.NullOr(Schema.Int),
  checkpoint: Schema.NullOr(Schema.String),
  next_attempt_at: Schema.Int,
  failures: Schema.Int,
});
const decodeStates = Schema.decodeUnknownEffect(Schema.Array(StateRow));
const toState = (row: typeof StateRow.Type): SourceState => ({
  source: row.source,
  fingerprint: row.fingerprint,
  refreshedAt: row.refreshed_at,
  nextRefreshAt: row.next_refresh_at,
  checkpoint: row.checkpoint,
  nextAttemptAt: row.next_attempt_at,
  failures: row.failures,
});

/**
 * Bump when the table layout changes. The data is disposable, so an older
 * layout is dropped and every source refills on its next refresh.
 */
const SCHEMA_VERSION = 4;

const BATCH_SIZE = 500;

/**
 * SQLite persistence. SQL failures are defects: the database is local and
 * disposable, so there's nothing sensible to recover into.
 */
export class Store extends Context.Service<
  Store,
  {
    readonly sourceState: (source: string) => Effect.Effect<SourceState>;
    readonly sourceStates: Effect.Effect<ReadonlyArray<SourceState>>;
    /** Recorded before calling upstream, so a crash mid-attempt still counts. */
    readonly recordAttempt: (
      source: string,
      attempt: { readonly failures: number; readonly nextAttemptAt: number },
    ) => Effect.Effect<void>;
    /** Pushes the next attempt back (never forward), e.g. to honour a rate limit. */
    readonly deferAttempt: (
      source: string,
      nextAttemptAt: number,
    ) => Effect.Effect<void>;
    /** Upstream had nothing new: keep the rows, mark the source fresh. */
    readonly recordUnchanged: (
      source: string,
      refresh: { readonly refreshedAt: number; readonly nextRefreshAt: number },
    ) => Effect.Effect<void>;
    /**
     * Atomically swaps a source's rows for a snapshot (plus realtime mutations
     * that arrived while it was fetched) and marks the source fresh. With
     * `keepExisting`, rows missing from the snapshot are kept.
     */
    readonly replaceSource: (
      source: string,
      replacement: {
        readonly activities: ReadonlyArray<Activity>;
        readonly keepExisting: boolean;
        readonly mutations: ReadonlyArray<Mutation>;
        readonly fingerprint: string;
        readonly checkpoint: string | undefined;
        readonly refreshedAt: number;
        readonly nextRefreshAt: number;
      },
    ) => Effect.Effect<void>;
    /** Removes rows and state for sources that are no longer configured. */
    readonly dropSourcesExcept: (
      sources: ReadonlyArray<string>,
    ) => Effect.Effect<void>;
    readonly write: (
      source: string,
      mutations: ReadonlyArray<Mutation>,
    ) => Effect.Effect<void>;
    /** Newest first, with roll-ups in place of the activities they collect. */
    readonly query: (
      query: PageQuery,
    ) => Effect.Effect<ReadonlyArray<ActivityItem>>;
    readonly prune: (olderThan: number) => Effect.Effect<number>;
  }
>()("activity-cache/Store") {
  static readonly layer = Layer.effect(
    Store,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;

      yield* Effect.gen(function* () {
        const [{ user_version }] = (yield* sql`PRAGMA user_version`) as [
          { user_version: number },
        ];
        if (user_version === SCHEMA_VERSION) return;
        const tables = yield* sql<{ name: string }>`
          SELECT name FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        `;
        for (const { name } of tables) yield* sql`DROP TABLE ${sql(name)}`;
        yield* sql`
          CREATE TABLE activity (
            source TEXT NOT NULL,
            id TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            type TEXT NOT NULL,
            data TEXT NOT NULL,
            group_id TEXT,
            collects TEXT,
            PRIMARY KEY (source, id)
          )
        `;
        yield* sql`CREATE INDEX activity_timestamp ON activity (timestamp DESC, id DESC)`;
        yield* sql`CREATE INDEX activity_group ON activity (source, group_id) WHERE group_id IS NOT NULL`;
        yield* sql`CREATE INDEX activity_collects ON activity (source, collects) WHERE collects IS NOT NULL`;
        yield* sql`
          CREATE TABLE source_state (
            source TEXT PRIMARY KEY,
            fingerprint TEXT,
            refreshed_at INTEGER,
            next_refresh_at INTEGER,
            checkpoint TEXT,
            next_attempt_at INTEGER NOT NULL DEFAULT 0,
            failures INTEGER NOT NULL DEFAULT 0
          )
        `;
        yield* sql.unsafe(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      }).pipe(sql.withTransaction, Effect.orDie);

      const sourceStates = sql`SELECT * FROM source_state`.pipe(
        Effect.flatMap(decodeStates),
        Effect.map((rows) => rows.map(toState)),
        Effect.orDie,
      );

      const sourceState = (source: string) =>
        sql`SELECT * FROM source_state WHERE source = ${source}`.pipe(
          Effect.flatMap(decodeStates),
          Effect.map(([row]): SourceState =>
            row
              ? toState(row)
              : {
                  source,
                  fingerprint: null,
                  refreshedAt: null,
                  nextRefreshAt: null,
                  checkpoint: null,
                  nextAttemptAt: 0,
                  failures: 0,
                },
          ),
          Effect.orDie,
        );

      const recordAttempt = (
        source: string,
        attempt: { readonly failures: number; readonly nextAttemptAt: number },
      ) =>
        sql`
          INSERT INTO source_state (source, failures, next_attempt_at)
          VALUES (${source}, ${attempt.failures}, ${attempt.nextAttemptAt})
          ON CONFLICT (source) DO UPDATE SET
            failures = excluded.failures,
            next_attempt_at = excluded.next_attempt_at
        `.pipe(Effect.asVoid, Effect.orDie);

      const deferAttempt = (source: string, nextAttemptAt: number) =>
        sql`
          UPDATE source_state
          SET next_attempt_at = MAX(next_attempt_at, ${nextAttemptAt})
          WHERE source = ${source}
        `.pipe(Effect.asVoid, Effect.orDie);

      const recordUnchanged = (
        source: string,
        refresh: {
          readonly refreshedAt: number;
          readonly nextRefreshAt: number;
        },
      ) =>
        sql`
          UPDATE source_state
          SET refreshed_at = ${refresh.refreshedAt},
            next_refresh_at = ${refresh.nextRefreshAt},
            failures = 0,
            next_attempt_at = 0
          WHERE source = ${source}
        `.pipe(Effect.asVoid, Effect.orDie);

      const upsert = (source: string, activities: ReadonlyArray<Activity>) =>
        Effect.forEach(
          chunks(activities, BATCH_SIZE),
          (batch) =>
            sql`
              INSERT INTO activity ${sql.insert(
                batch.map((a) => ({
                  source,
                  id: a.id,
                  timestamp: a.timestamp,
                  type: a.type,
                  data: JSON.stringify(a.data),
                  group_id: a.group ?? null,
                  collects: a.collects ?? null,
                })),
              )}
              ON CONFLICT (source, id) DO UPDATE SET
                timestamp = excluded.timestamp,
                type = excluded.type,
                data = excluded.data,
                group_id = excluded.group_id,
                collects = excluded.collects
            `,
          { discard: true },
        );

      const remove = (source: string, ids: ReadonlyArray<string>) =>
        Effect.forEach(
          chunks(ids, BATCH_SIZE),
          (batch) =>
            sql`DELETE FROM activity WHERE source = ${source} AND ${sql.in("id", batch)}`,
          { discard: true },
        );

      // Consecutive mutations of the same kind are batched; order across
      // kinds is preserved, so upsert → delete → upsert of one id ends present.
      const applyMutations = (
        source: string,
        mutations: ReadonlyArray<Mutation>,
      ) =>
        Effect.gen(function* () {
          let upserts: Array<Activity> = [];
          let deletes: Array<string> = [];
          const flush = Effect.suspend(() => {
            const [u, d] = [upserts, deletes];
            upserts = [];
            deletes = [];
            return Effect.andThen(upsert(source, u), remove(source, d));
          });
          for (const mutation of mutations) {
            if (mutation._tag === "Upsert") {
              if (deletes.length) yield* flush;
              upserts.push(mutation.activity);
            } else {
              if (upserts.length) yield* flush;
              deletes.push(mutation.id);
            }
          }
          yield* flush;
        });

      const write = (source: string, mutations: ReadonlyArray<Mutation>) =>
        applyMutations(source, mutations).pipe(
          sql.withTransaction,
          Effect.orDie,
        );

      const replaceSource = (
        source: string,
        replacement: {
          readonly activities: ReadonlyArray<Activity>;
          readonly keepExisting: boolean;
          readonly mutations: ReadonlyArray<Mutation>;
          readonly fingerprint: string;
          readonly checkpoint: string | undefined;
          readonly refreshedAt: number;
          readonly nextRefreshAt: number;
        },
      ) =>
        Effect.gen(function* () {
          if (!replacement.keepExisting) {
            yield* sql`DELETE FROM activity WHERE source = ${source}`;
          }
          yield* upsert(source, replacement.activities);
          yield* applyMutations(source, replacement.mutations);
          yield* sql`
            INSERT INTO source_state
              (source, fingerprint, refreshed_at, next_refresh_at, checkpoint, next_attempt_at, failures)
            VALUES (
              ${source}, ${replacement.fingerprint}, ${replacement.refreshedAt},
              ${replacement.nextRefreshAt}, ${replacement.checkpoint ?? null}, 0, 0
            )
            ON CONFLICT (source) DO UPDATE SET
              fingerprint = excluded.fingerprint,
              refreshed_at = excluded.refreshed_at,
              next_refresh_at = excluded.next_refresh_at,
              checkpoint = excluded.checkpoint,
              next_attempt_at = 0,
              failures = 0
          `;
        }).pipe(sql.withTransaction, Effect.orDie);

      const dropSourcesExcept = (sources: ReadonlyArray<string>) =>
        Effect.gen(function* () {
          const keep = sql.in(sources.length ? sources : [""]);
          yield* sql`DELETE FROM activity WHERE source NOT IN ${keep}`;
          yield* sql`DELETE FROM source_state WHERE source NOT IN ${keep}`;
        }).pipe(sql.withTransaction, Effect.orDie);

      // `rollups` is one row per group that's rolled up: the winning
      // collector's id, at its group's first activity's timestamp. The feed is
      // everything else, minus collectors and the groups they roll up.
      const query = (query: PageQuery) =>
        Effect.gen(function* () {
          const rows = yield* sql`
            WITH rollups AS (
              SELECT c.source, c.collects AS group_id, MIN(c.id) AS id, f.timestamp
              FROM activity c
              JOIN activity f ON f.source = c.source AND f.id = c.collects
              WHERE c.collects IS NOT NULL
              GROUP BY c.source, c.collects
            ),
            feed AS (
              SELECT a.source, a.id, a.timestamp, a.type, a.data, NULL AS rollup
              FROM activity a
              WHERE a.collects IS NULL AND NOT EXISTS (
                SELECT 1 FROM rollups r
                WHERE r.source = a.source AND r.group_id = a.group_id
              )
              UNION ALL
              SELECT c.source, c.id, r.timestamp, c.type, c.data, r.group_id
              FROM rollups r
              JOIN activity c ON c.source = r.source AND c.id = r.id
            )
            SELECT * FROM feed
            WHERE ${sql.and([
              query.before
                ? sql`(timestamp, id) < (${query.before.timestamp}, ${query.before.id})`
                : sql`1 = 1`,
              query.types?.length ? sql.in("type", query.types) : sql`1 = 1`,
            ])}
            ORDER BY timestamp DESC, id DESC
            LIMIT ${query.limit}
          `.pipe(Effect.flatMap(decodeFeedRows));

          const groups = [
            ...new Set(rows.flatMap((r) => (r.rollup ? [r.rollup] : []))),
          ];
          const members = groups.length
            ? yield* sql`
                SELECT source, group_id, id, timestamp, type, data FROM activity
                WHERE ${sql.in("group_id", groups)}
                ORDER BY timestamp ASC, id ASC
              `.pipe(Effect.flatMap(decodeMemberRows))
            : [];
          const membersOf = (row: typeof FeedRow.Type) =>
            members
              .filter(
                (m) => m.source === row.source && m.group_id === row.rollup,
              )
              .map(toItem);

          return rows.map((row): ActivityItem =>
            row.rollup === null
              ? toItem(row)
              : { ...toItem(row), members: membersOf(row) },
          );
        }).pipe(sql.withTransaction, Effect.orDie);

      const prune = (olderThan: number) =>
        sql`DELETE FROM activity WHERE timestamp < ${olderThan} RETURNING id`.pipe(
          Effect.map((rows) => rows.length),
          Effect.orDie,
        );

      return Store.of({
        sourceState,
        sourceStates,
        recordAttempt,
        deferAttempt,
        recordUnchanged,
        replaceSource,
        dropSourcesExcept,
        write,
        query,
        prune,
      });
    }),
  );
}

const toItem = (row: {
  readonly id: string;
  readonly timestamp: number;
  readonly type: string;
  readonly data: Schema.Json;
}): ActivityItem => ({
  id: row.id,
  timestamp: row.timestamp,
  type: row.type,
  data: row.data,
});

const chunks = <A>(items: ReadonlyArray<A>, size: number): Array<Array<A>> => {
  const result: Array<Array<A>> = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
};
