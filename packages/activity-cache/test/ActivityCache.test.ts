import { SqliteClient } from "@effect/sql-sqlite-node";
import { assert, describe, it } from "@effect/vitest";
import { Context, Deferred, Effect, Exit, Fiber, Layer, Stream } from "effect";
import { TestClock } from "effect/testing";
import { type Activity, Mutation, RETENTION_MS } from "../src/Activity.ts";
import { ActivityCache } from "../src/ActivityCache.ts";
import { SourceError, Sources } from "../src/Source.ts";
import { Store } from "../src/Store.ts";

/** A source whose next backfill result each test controls. */
class FakeSource extends Context.Service<
  FakeSource,
  { next: Effect.Effect<ReadonlyArray<Activity>, SourceError> }
>()("test/FakeSource") {}

const TestLayer = ActivityCache.layer.pipe(
  Layer.provideMerge(Store.layer),
  Layer.provide(
    Layer.effect(
      Sources,
      Effect.map(FakeSource, (fake) => [
        {
          name: "fake",
          backfill: () =>
            Stream.fromIterableEffect(Effect.suspend(() => fake.next)),
        },
      ]),
    ),
  ),
  Layer.provideMerge(
    Layer.sync(FakeSource, () => ({ next: Effect.succeed([]) })),
  ),
  Layer.provide(SqliteClient.layer({ filename: ":memory:" })),
);

const activity = (
  id: string,
  timestamp: number,
  data: string = id,
): Activity => ({
  id,
  timestamp,
  type: "test",
  data,
});

const contents = ActivityCache.use((cache) => cache.query({ limit: 100 })).pipe(
  Effect.map((items) => items.map((a) => `${a.id}=${a.data}`).sort()),
);

describe("ActivityCache", () => {
  it.effect("isn't ready until the first rebuild finishes", () =>
    Effect.gen(function* () {
      const cache = yield* ActivityCache;
      const exit = yield* Effect.exit(cache.query({ limit: 10 }));
      assert.isTrue(Exit.hasFails(exit));

      yield* cache.rebuild;
      assert.deepStrictEqual(yield* contents, []);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("pages newest first", () =>
    Effect.gen(function* () {
      const cache = yield* ActivityCache;
      const fake = yield* FakeSource;
      fake.next = Effect.succeed([
        activity("a", 1),
        activity("b", 3),
        activity("c", 2),
        activity("d", 2),
      ]);
      yield* cache.rebuild;

      const first = yield* cache.query({ limit: 2 });
      assert.deepStrictEqual(
        first.map((a) => a.id),
        ["b", "d"],
      );
      const second = yield* cache.query({ limit: 2, before: first[1] });
      assert.deepStrictEqual(
        second.map((a) => a.id),
        ["c", "a"],
      );
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect(
    "keeps serving and accepting realtime writes while rebuilding",
    () =>
      Effect.gen(function* () {
        const cache = yield* ActivityCache;
        const fake = yield* FakeSource;
        fake.next = Effect.succeed([
          activity("a", 1, "v1"),
          activity("old", 1),
        ]);
        yield* cache.rebuild;

        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        // The snapshot predates the realtime writes below: it still has the old
        // version of `a` and the soon-to-be-deleted `b`, and doesn't have `c`.
        fake.next = Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Deferred.await(release)),
          Effect.as([activity("a", 1, "v1"), activity("b", 2)]),
        );
        const rebuilding = yield* Effect.forkChild(cache.rebuild);
        yield* Deferred.await(started);

        yield* cache.apply([
          Mutation.upsert(activity("a", 1, "v2")),
          Mutation.upsert(activity("b", 2)),
          Mutation.delete("b"),
          Mutation.upsert(activity("c", 3)),
        ]);
        // Still reading the previous generation, with the realtime writes applied.
        assert.deepStrictEqual(yield* contents, ["a=v2", "c=c", "old=old"]);

        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(rebuilding);

        // New generation: `old` is gone (not in the snapshot), realtime writes win.
        assert.deepStrictEqual(yield* contents, ["a=v2", "c=c"]);
        const status = yield* cache.status;
        assert.strictEqual(status.building, undefined);
      }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("keeps the live generation when a rebuild fails", () =>
    Effect.gen(function* () {
      const cache = yield* ActivityCache;
      const fake = yield* FakeSource;
      fake.next = Effect.succeed([activity("a", 1)]);
      yield* cache.rebuild;
      const before = yield* cache.status;

      fake.next = Effect.fail(
        new SourceError({ source: "fake", message: "boom", cause: null }),
      );
      const exit = yield* Effect.exit(cache.rebuild);
      assert.isTrue(Exit.hasFails(exit));

      assert.deepStrictEqual(yield* cache.status, before);
      assert.deepStrictEqual(yield* contents, ["a=a"]);

      // The abandoned generation's table is gone and rebuilds still work.
      fake.next = Effect.succeed([activity("b", 1)]);
      yield* cache.rebuild;
      assert.deepStrictEqual(yield* contents, ["b=b"]);
    }).pipe(Effect.provide(TestLayer)),
  );

  it.effect("prunes activity older than the retention window", () =>
    Effect.gen(function* () {
      const cache = yield* ActivityCache;
      const fake = yield* FakeSource;
      fake.next = Effect.succeed([activity("old", 0), activity("new", 1000)]);
      yield* cache.rebuild;

      yield* TestClock.adjust(RETENTION_MS + 500);
      yield* cache.prune;
      assert.deepStrictEqual(yield* contents, ["new=new"]);
    }).pipe(Effect.provide(TestLayer)),
  );
});
