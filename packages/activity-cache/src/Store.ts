import { Clock, Context, Effect, Layer, Schema } from "effect";
import { SqlClient } from "effect/sql";
import { Activity, type Mutation } from "./Activity.ts";

/**
 * A complete copy of the cache, in its own `activity_<id>` table. Rebuilds
 * write a new generation alongside the live one and swap when it's done.
 */
export type Generation = number;

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

const Row = Schema.Struct({
  id: Schema.String,
  timestamp: Schema.Int,
  type: Schema.String,
  data: Schema.fromJsonString(Schema.Json),
});
const decodeRows = Schema.decodeUnknownEffect(Schema.Array(Row));

const GenerationRow = Schema.Struct({ id: Schema.Int });
const decodeGenerations = Schema.decodeUnknownEffect(
  Schema.Array(GenerationRow),
);

const BATCH_SIZE = 500;

/**
 * SQLite persistence. Doesn't know which generation is live; that's
 * `ActivityCache`'s job. SQL failures are defects: the database is local and
 * disposable, so there's nothing sensible to recover into.
 */
export class Store extends Context.Service<
  Store,
  {
    /** The generation that was live when the process last swapped, if any. */
    readonly activeGeneration: Effect.Effect<Generation | undefined>;
    readonly createGeneration: Effect.Effect<Generation>;
    readonly activateGeneration: (
      generation: Generation,
    ) => Effect.Effect<void>;
    readonly dropGeneration: (generation: Generation) => Effect.Effect<void>;
    /** Drops every generation except the active one, e.g. a rebuild interrupted by a restart. */
    readonly dropInactiveGenerations: Effect.Effect<void>;
    readonly write: (
      generation: Generation,
      mutations: ReadonlyArray<Mutation>,
    ) => Effect.Effect<void>;
    readonly query: (
      generation: Generation,
      query: PageQuery,
    ) => Effect.Effect<ReadonlyArray<Activity>>;
    readonly prune: (
      generation: Generation,
      olderThan: number,
    ) => Effect.Effect<number>;
  }
>()("activity-cache/Store") {
  static readonly layer = Layer.effect(
    Store,
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      const table = (generation: Generation) => sql(`activity_${generation}`);

      yield* sql`
        CREATE TABLE IF NOT EXISTS generations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          created_at INTEGER NOT NULL,
          active INTEGER NOT NULL DEFAULT 0
        )
      `.pipe(Effect.orDie);

      const activeGeneration =
        sql`SELECT id FROM generations WHERE active = 1`.pipe(
          Effect.flatMap(decodeGenerations),
          Effect.map((rows) => rows[0]?.id),
          Effect.orDie,
        );

      const createGeneration = Effect.gen(function* () {
        const now = yield* Clock.currentTimeMillis;
        const [{ id }] = (yield* sql`
          INSERT INTO generations (created_at) VALUES (${now}) RETURNING id
        `.pipe(Effect.flatMap(decodeGenerations))) as [{ id: number }];
        yield* sql`
          CREATE TABLE ${table(id)} (
            id TEXT PRIMARY KEY,
            timestamp INTEGER NOT NULL,
            type TEXT NOT NULL,
            data TEXT NOT NULL
          )
        `;
        yield* sql`
          CREATE INDEX ${sql(`activity_${id}_timestamp`)}
          ON ${table(id)} (timestamp DESC, id DESC)
        `;
        return id;
      }).pipe(sql.withTransaction, Effect.orDie);

      const activateGeneration = (generation: Generation) =>
        sql`UPDATE generations SET active = (id = ${generation})`.pipe(
          Effect.asVoid,
          Effect.orDie,
        );

      const dropGeneration = (generation: Generation) =>
        Effect.gen(function* () {
          yield* sql`DROP TABLE IF EXISTS ${table(generation)}`;
          yield* sql`DELETE FROM generations WHERE id = ${generation}`;
        }).pipe(sql.withTransaction, Effect.orDie);

      const dropInactiveGenerations = sql`
        SELECT id FROM generations WHERE active = 0
      `.pipe(
        Effect.flatMap(decodeGenerations),
        Effect.orDie,
        Effect.flatMap(
          Effect.forEach(({ id }) => dropGeneration(id), { discard: true }),
        ),
      );

      const upsert = (generation: Generation, activities: Array<Activity>) =>
        sql`
          INSERT INTO ${table(generation)} ${sql.insert(
            activities.map((a) => ({
              id: a.id,
              timestamp: a.timestamp,
              type: a.type,
              data: JSON.stringify(a.data),
            })),
          )}
          ON CONFLICT (id) DO UPDATE SET
            timestamp = excluded.timestamp,
            type = excluded.type,
            data = excluded.data
        `;

      const remove = (generation: Generation, ids: Array<string>) =>
        sql`DELETE FROM ${table(generation)} WHERE ${sql.in("id", ids)}`;

      // Consecutive mutations of the same kind are batched into one statement;
      // order across kinds is preserved, so upsert → delete → upsert of the
      // same id still ends with the row present.
      const write = (
        generation: Generation,
        mutations: ReadonlyArray<Mutation>,
      ) =>
        Effect.gen(function* () {
          let upserts: Array<Activity> = [];
          let deletes: Array<string> = [];
          const flushUpserts = Effect.suspend(() => {
            const batch = upserts;
            upserts = [];
            return batch.length
              ? Effect.asVoid(upsert(generation, batch))
              : Effect.void;
          });
          const flushDeletes = Effect.suspend(() => {
            const batch = deletes;
            deletes = [];
            return batch.length
              ? Effect.asVoid(remove(generation, batch))
              : Effect.void;
          });
          for (const mutation of mutations) {
            if (mutation._tag === "Upsert") {
              yield* flushDeletes;
              upserts.push(mutation.activity);
              if (upserts.length >= BATCH_SIZE) yield* flushUpserts;
            } else {
              yield* flushUpserts;
              deletes.push(mutation.id);
              if (deletes.length >= BATCH_SIZE) yield* flushDeletes;
            }
          }
          yield* flushUpserts;
          yield* flushDeletes;
        }).pipe(sql.withTransaction, Effect.orDie);

      const query = (generation: Generation, query: PageQuery) =>
        sql`
          SELECT id, timestamp, type, data FROM ${table(generation)}
          WHERE ${sql.and([
            query.before
              ? sql`(timestamp, id) < (${query.before.timestamp}, ${query.before.id})`
              : sql`1 = 1`,
            query.types?.length ? sql.in("type", query.types) : sql`1 = 1`,
          ])}
          ORDER BY timestamp DESC, id DESC
          LIMIT ${query.limit}
        `.pipe(Effect.flatMap(decodeRows), Effect.orDie);

      const prune = (generation: Generation, olderThan: number) =>
        sql`
          DELETE FROM ${table(generation)} WHERE timestamp < ${olderThan} RETURNING id
        `.pipe(
          Effect.map((rows) => rows.length),
          Effect.orDie,
        );

      return Store.of({
        activeGeneration,
        createGeneration,
        activateGeneration,
        dropGeneration,
        dropInactiveGenerations,
        write,
        query,
        prune,
      });
    }),
  );
}
