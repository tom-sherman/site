import { SqliteClient } from "@effect/sql-sqlite-node";
import { assert, describe, it } from "@effect/vitest";
import {
  Context,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  Scope,
} from "effect";
import { TestClock } from "effect/testing";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach } from "vitest";
import {
  type Activity,
  type ActivityItem,
  Mutation,
  RETENTION_MS,
} from "../src/Activity.ts";
import { ActivityCache } from "../src/ActivityCache.ts";
import {
  type SnapshotResult,
  SnapshotResult as Result,
  type Source,
  SourceError,
  Sources,
} from "../src/Source.ts";
import { type PageCursor, type PageQuery, Store } from "../src/Store.ts";

const activity = (
  id: string,
  timestamp = 1000,
  data: string = id,
): Activity => ({ id, timestamp, type: "test", data });

/** A snapshot asking to be refreshed again in 5 minutes. */
const snap = (
  activities: ReadonlyArray<Activity>,
  checkpoint: string | undefined,
) => Result.snapshot(activities, checkpoint, "5 minutes");

/** A source whose responses each test controls, recording every call. */
const fakeSource = (name: string) => {
  const fake = {
    fingerprint: "v1",
    appendOnly: false,
    calls: [] as Array<{ since: number; checkpoint: string | undefined }>,
    respond: (_: {
      since: number;
      checkpoint: string | undefined;
    }): Effect.Effect<SnapshotResult, SourceError> =>
      Effect.succeed(snap([], undefined)),
  };
  const source: Source = {
    name,
    get fingerprint() {
      return fake.fingerprint;
    },
    get appendOnly() {
      return fake.appendOnly;
    },
    snapshot: (options) =>
      Effect.suspend(() => {
        fake.calls.push(options);
        return fake.respond(options);
      }),
  };
  return Object.assign(fake, { source });
};
type Fake = ReturnType<typeof fakeSource>;

const failure = (retryAt?: number) =>
  new SourceError({ source: "fake", message: "boom", retryAt, cause: null });

let dirs: Array<string> = [];
afterEach(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  dirs = [];
});
const tempDb = () => {
  const dir = mkdtempSync(join(tmpdir(), "activity-cache-"));
  dirs.push(dir);
  return join(dir, "cache.db");
};

/** Boots the cache against `filename`; `stop` ends the "process". */
const boot = (filename: string, fakes: ReadonlyArray<Fake>) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make();
    const context = yield* Layer.buildWithScope(
      ActivityCache.layer.pipe(
        Layer.provide(Store.layer),
        Layer.provide(
          Layer.succeed(
            Sources,
            fakes.map((f) => f.source),
          ),
        ),
        Layer.provide(SqliteClient.layer({ filename })),
      ),
      scope,
    );
    return {
      cache: Context.get(context, ActivityCache),
      scope,
      stop: Scope.close(scope, Exit.void),
    };
  });

/** Lets forked fibers run until they're all waiting again. */
const settle = Effect.gen(function* () {
  for (let i = 0; i < 50; i++) yield* Effect.yieldNow;
});

/** Boots and starts the scheduler, like `main.ts` does. */
const start = (filename: string, fakes: ReadonlyArray<Fake>) =>
  Effect.gen(function* () {
    const process = yield* boot(filename, fakes);
    yield* Effect.forkIn(process.cache.run, process.scope);
    yield* settle;
    return process;
  });

const advance = (duration: Duration.Input) =>
  TestClock.adjust(duration).pipe(Effect.andThen(settle));

const contents = (cache: ActivityCache["Service"]) =>
  cache
    .query({ limit: 100 })
    .pipe(Effect.map((items) => items.map((a) => `${a.id}=${a.data}`).sort()));

describe("ActivityCache", () => {
  it.effect("replaces only the refreshed source's rows", () =>
    Effect.gen(function* () {
      const a = fakeSource("a");
      const b = fakeSource("b");
      a.respond = () => Effect.succeed(snap([activity("a1")], "a@1"));
      b.respond = () => Effect.succeed(snap([activity("b1")], "b@1"));
      const { cache, stop } = yield* boot(tempDb(), [a, b]);
      yield* cache.refresh("a");
      yield* cache.refresh("b");
      assert.deepStrictEqual(yield* contents(cache), ["a1=a1", "b1=b1"]);

      a.respond = () => Effect.succeed(snap([activity("a2")], "a@2"));
      yield* cache.refresh("a");
      assert.deepStrictEqual(yield* contents(cache), ["a2=a2", "b1=b1"]);
      assert.strictEqual(a.calls[1]!.checkpoint, "a@1");
      yield* stop;
    }),
  );

  it.effect("keeps rows and marks the source fresh when nothing changed", () =>
    Effect.gen(function* () {
      const a = fakeSource("a");
      a.respond = () => Effect.succeed(snap([activity("a1")], "a@1"));
      const { cache, stop } = yield* boot(tempDb(), [a]);
      yield* cache.refresh("a");

      a.respond = () => Effect.succeed(Result.unchanged("5 minutes"));
      yield* TestClock.adjust("1 minute");
      yield* cache.refresh("a");
      assert.deepStrictEqual(yield* contents(cache), ["a1=a1"]);
      const [status] = yield* cache.status;
      assert.strictEqual(status!.refreshedAt, 60_000);
      yield* stop;
    }),
  );

  it.effect(
    "keeps serving and accepting realtime writes while refreshing",
    () =>
      Effect.gen(function* () {
        const a = fakeSource("a");
        a.respond = () =>
          Effect.succeed(snap([activity("x", 1, "v1"), activity("old")], "1"));
        const { cache, stop } = yield* boot(tempDb(), [a]);
        yield* cache.refresh("a");

        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        // The snapshot predates the realtime writes below: it still has the old
        // version of `x` and the soon-to-be-deleted `y`, and doesn't have `z`.
        a.respond = () =>
          Deferred.succeed(started, undefined).pipe(
            Effect.andThen(Deferred.await(release)),
            Effect.as(snap([activity("x", 1, "v1"), activity("y")], "2")),
          );
        const refreshing = yield* Effect.forkChild(cache.refresh("a"));
        yield* Deferred.await(started);

        yield* cache.apply("a", [
          Mutation.upsert(activity("x", 1, "v2")),
          Mutation.upsert(activity("y")),
          Mutation.delete("y"),
          Mutation.upsert(activity("z")),
        ]);
        // Still the previous rows, with the realtime writes applied.
        assert.deepStrictEqual(yield* contents(cache), [
          "old=old",
          "x=v2",
          "z=z",
        ]);
        assert.isTrue((yield* cache.status)[0]!.refreshing);

        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(refreshing);
        // The snapshot replaced the rows (`old` is gone) and realtime writes won.
        assert.deepStrictEqual(yield* contents(cache), ["x=v2", "z=z"]);
        assert.isFalse((yield* cache.status)[0]!.refreshing);
        yield* stop;
      }),
  );

  it.effect("keeps a source's rows when its refresh fails", () =>
    Effect.gen(function* () {
      const a = fakeSource("a");
      a.respond = () => Effect.succeed(snap([activity("a1")], "1"));
      const { cache, stop } = yield* boot(tempDb(), [a]);
      yield* cache.refresh("a");

      a.respond = () => Effect.fail(failure());
      const exit = yield* Effect.exit(cache.refresh("a"));
      assert.isTrue(Exit.hasFails(exit));
      assert.deepStrictEqual(yield* contents(cache), ["a1=a1"]);
      const [status] = yield* cache.status;
      assert.strictEqual(status!.failures, 1);
      assert.strictEqual(status!.nextAttemptAt, 30_000);
      yield* stop;
    }),
  );

  it.effect("prunes activity older than the retention window", () =>
    Effect.gen(function* () {
      const a = fakeSource("a");
      a.respond = () =>
        Effect.succeed(snap([activity("old", 0), activity("new", 1000)], "1"));
      const { cache, stop } = yield* boot(tempDb(), [a]);
      yield* cache.refresh("a");

      yield* TestClock.adjust(RETENTION_MS + 500);
      yield* cache.prune;
      assert.deepStrictEqual(yield* contents(cache), ["new=new"]);
      yield* stop;
    }),
  );
});

describe("ActivityCache with an append-only source", () => {
  it.effect("keeps rows that upstream stopped serving", () =>
    Effect.gen(function* () {
      const a = fakeSource("a");
      a.appendOnly = true;
      a.respond = () =>
        Effect.succeed(snap([activity("e2", 2000), activity("e1", 1000)], "1"));
      const { cache, stop } = yield* boot(tempDb(), [a]);
      yield* cache.refresh("a");

      // `e1` fell out of upstream's window; `e2` changed.
      a.respond = () =>
        Effect.succeed(
          snap([activity("e3", 3000), activity("e2", 2000, "v2")], "2"),
        );
      yield* cache.refresh("a");
      assert.deepStrictEqual(yield* contents(cache), [
        "e1=e1",
        "e2=v2",
        "e3=e3",
      ]);

      // Until it's older than the retention window.
      yield* TestClock.adjust(RETENTION_MS + 1500);
      yield* cache.prune;
      assert.deepStrictEqual(yield* contents(cache), ["e2=v2", "e3=e3"]);
      yield* stop;
    }),
  );

  it.effect("still lets realtime writes during a refresh win", () =>
    Effect.gen(function* () {
      const a = fakeSource("a");
      a.appendOnly = true;
      const { cache, stop } = yield* boot(tempDb(), [a]);
      yield* cache.refresh("a");

      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      a.respond = () =>
        Deferred.succeed(started, undefined).pipe(
          Effect.andThen(Deferred.await(release)),
          Effect.as(snap([activity("x", 1, "v1"), activity("y")], "2")),
        );
      const refreshing = yield* Effect.forkChild(cache.refresh("a"));
      yield* Deferred.await(started);
      yield* cache.apply("a", [
        Mutation.upsert(activity("x", 1, "v2")),
        Mutation.delete("y"),
      ]);
      yield* Deferred.succeed(release, undefined);
      yield* Fiber.join(refreshing);
      assert.deepStrictEqual(yield* contents(cache), ["x=v2"]);
      yield* stop;
    }),
  );

  it.effect("replaces its rows when the fingerprint changes", () =>
    Effect.gen(function* () {
      const db = tempDb();
      const a = fakeSource("a");
      a.appendOnly = true;
      a.respond = () => Effect.succeed(snap([activity("v1-row")], "1"));
      const first = yield* start(db, [a]);
      yield* first.stop;

      a.fingerprint = "v2";
      a.respond = () => Effect.succeed(snap([activity("v2-row")], "2"));
      const second = yield* start(db, [a]);
      assert.deepStrictEqual(yield* contents(second.cache), ["v2-row=v2-row"]);
      yield* second.stop;
    }),
  );
});

describe("ActivityCache across restarts", () => {
  it.effect("doesn't refetch a fresh source on boot", () =>
    Effect.gen(function* () {
      const db = tempDb();
      const a = fakeSource("a");
      a.respond = () => Effect.succeed(snap([activity("a1")], "a@1"));

      const first = yield* start(db, [a]);
      assert.strictEqual(a.calls.length, 1);
      yield* advance("2 minutes");
      yield* first.stop;

      const second = yield* start(db, [a]);
      assert.strictEqual(a.calls.length, 1);
      assert.deepStrictEqual(yield* contents(second.cache), ["a1=a1"]);

      // Due 5 minutes after the last refresh, not after the restart.
      yield* advance("3 minutes");
      assert.strictEqual(a.calls.length, 2);
      assert.strictEqual(a.calls[1]!.checkpoint, "a@1");
      yield* second.stop;
    }),
  );

  it.effect("refreshes when the source asked to, across restarts", () =>
    Effect.gen(function* () {
      const db = tempDb();
      const a = fakeSource("a");
      // e.g. GitHub's X-Poll-Interval, which can change between responses.
      a.respond = () =>
        Effect.succeed(Result.snapshot([activity("a1")], "1", "10 minutes"));

      const first = yield* start(db, [a]);
      yield* advance("6 minutes");
      yield* first.stop;

      a.respond = () => Effect.succeed(Result.unchanged("1 minute"));
      const second = yield* start(db, [a]);
      yield* advance("3 minutes");
      assert.strictEqual(a.calls.length, 1);
      yield* advance("1 minute");
      assert.strictEqual(a.calls.length, 2);
      // Then whatever the latest response asked for.
      yield* advance("1 minute");
      assert.strictEqual(a.calls.length, 3);
      yield* second.stop;
    }),
  );

  it.effect(
    "rebuilds a source whose fingerprint changed, serving old rows until then",
    () =>
      Effect.gen(function* () {
        const db = tempDb();
        const a = fakeSource("a");
        a.respond = () => Effect.succeed(snap([activity("v1-row")], "a@1"));
        const first = yield* start(db, [a]);
        yield* first.stop;

        a.fingerprint = "v2";
        const release = yield* Deferred.make<void>();
        a.respond = () =>
          Deferred.await(release).pipe(
            Effect.as(snap([activity("v2-row")], "a@2")),
          );
        const second = yield* start(db, [a]);
        assert.strictEqual(a.calls.length, 2);
        // A rebuild ignores the checkpoint, so the source can't answer "unchanged".
        assert.strictEqual(a.calls[1]!.checkpoint, undefined);
        assert.isFalse((yield* second.cache.status)[0]!.upToDate);
        assert.deepStrictEqual(yield* contents(second.cache), [
          "v1-row=v1-row",
        ]);

        yield* Deferred.succeed(release, undefined);
        yield* settle;
        assert.deepStrictEqual(yield* contents(second.cache), [
          "v2-row=v2-row",
        ]);
        assert.isTrue((yield* second.cache.status)[0]!.upToDate);
        yield* second.stop;
      }),
  );

  it.effect(
    "backs off across restarts instead of hammering upstream in a crash loop",
    () =>
      Effect.gen(function* () {
        const db = tempDb();
        const a = fakeSource("a");
        // Every attempt hangs until the process "crashes".
        a.respond = () => Effect.never;

        // Seconds until each attempt is allowed: immediately, then 30s, 1m, 2m.
        const waits = [0, 30, 60, 120];
        for (const [i, wait] of waits.entries()) {
          const process = yield* start(db, [a]);
          if (wait > 0) {
            // Restarting doesn't attempt again until the persisted backoff is up.
            assert.strictEqual(a.calls.length, i, `restart ${i}`);
            yield* advance(Duration.seconds(wait - 1));
            assert.strictEqual(a.calls.length, i, `restart ${i}, ${wait - 1}s`);
            yield* advance("1 second");
          }
          assert.strictEqual(a.calls.length, i + 1, `restart ${i}, ${wait}s`);
          yield* process.stop;
        }
      }),
  );

  it.effect("honours upstream's retryAt across restarts", () =>
    Effect.gen(function* () {
      const db = tempDb();
      const a = fakeSource("a");
      a.respond = () => Effect.fail(failure(10 * 60_000));

      const first = yield* start(db, [a]);
      assert.strictEqual(a.calls.length, 1);
      yield* first.stop;

      a.respond = () => Effect.succeed(snap([activity("a1")], "1"));
      const second = yield* start(db, [a]);
      // Our own backoff would retry after 30s; upstream said 10 minutes.
      yield* advance("9 minutes");
      assert.strictEqual(a.calls.length, 1);
      yield* advance("1 minute");
      assert.strictEqual(a.calls.length, 2);
      assert.deepStrictEqual(yield* contents(second.cache), ["a1=a1"]);
      yield* second.stop;
    }),
  );

  it.effect("drops rows of sources that are no longer configured", () =>
    Effect.gen(function* () {
      const db = tempDb();
      const a = fakeSource("a");
      const b = fakeSource("b");
      a.respond = () => Effect.succeed(snap([activity("a1")], "1"));
      b.respond = () => Effect.succeed(snap([activity("b1")], "1"));
      const first = yield* start(db, [a, b]);
      assert.deepStrictEqual(yield* contents(first.cache), ["a1=a1", "b1=b1"]);
      yield* first.stop;

      const second = yield* boot(db, [a]);
      assert.deepStrictEqual(yield* contents(second.cache), ["a1=a1"]);
      assert.deepStrictEqual(
        (yield* second.cache.status).map((s) => s.source),
        ["a"],
      );
      yield* second.stop;
    }),
  );

  it.effect("replaces a database with an older table layout", () =>
    Effect.gen(function* () {
      const db = tempDb();
      const old = new DatabaseSync(db);
      old.exec(`
        CREATE TABLE generations (id INTEGER PRIMARY KEY, created_at INTEGER, active INTEGER);
        CREATE TABLE activity_1 (id TEXT PRIMARY KEY, timestamp INTEGER, type TEXT, data TEXT);
      `);
      old.close();

      const { cache, stop } = yield* boot(db, [fakeSource("a")]);
      assert.deepStrictEqual(yield* contents(cache), []);
      yield* stop;

      const check = new DatabaseSync(db);
      const tables = check
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all()
        .map((r) => r.name);
      check.close();
      assert.deepStrictEqual(tables, ["activity", "source_state"]);
    }),
  );
});

describe("ActivityCache roll-ups", () => {
  const post = (id: string, timestamp: number, group?: string): Activity => ({
    id,
    timestamp,
    type: "post",
    data: id,
    group,
  });
  const thread = (id: string, timestamp: number, collects: string) => ({
    id,
    timestamp,
    type: "thread",
    data: id,
    collects,
  });

  /** `id@timestamp`, plus `[members]` for roll-ups. */
  const outline = (items: ReadonlyArray<ActivityItem>) =>
    items.map(
      (a) =>
        `${a.id}@${a.timestamp}` +
        (a.members ? `[${a.members.map((m) => m.id).join(",")}]` : ""),
    );

  const feed = (
    cache: ActivityCache["Service"],
    query: Partial<PageQuery> = {},
  ) => cache.query({ limit: 100, ...query }).pipe(Effect.map(outline));

  const withRows = (rows: ReadonlyArray<Activity>) =>
    Effect.gen(function* () {
      const a = fakeSource("a");
      a.respond = () => Effect.succeed(snap(rows, "1"));
      const process = yield* boot(tempDb(), [a]);
      yield* process.cache.refresh("a");
      return process;
    });

  it.effect(
    "serves a roll-up in place of its group, at the group's first activity",
    () =>
      Effect.gen(function* () {
        const { cache, stop } = yield* withRows([
          post("root", 100, "root"),
          post("reply-1", 200, "root"),
          post("reply-2", 300, "root"),
          post("other", 250, "other"),
          post("ungrouped", 150),
          thread("marker", 1000, "root"),
        ]);
        assert.deepStrictEqual(yield* feed(cache), [
          "other@250",
          "ungrouped@150",
          "marker@100[root,reply-1,reply-2]",
        ]);
        const [, , rollup] = yield* cache.query({ limit: 100 });
        assert.deepStrictEqual(rollup!.members![1], {
          id: "reply-1",
          timestamp: 200,
          type: "post",
          data: "reply-1",
        });
        yield* stop;
      }),
  );

  it.effect("shows the group as usual until its first activity is here", () =>
    Effect.gen(function* () {
      const { cache, stop } = yield* withRows([
        post("reply", 200, "root"),
        thread("marker", 1000, "root"),
      ]);
      assert.deepStrictEqual(yield* feed(cache), ["reply@200"]);

      yield* cache.apply("a", [Mutation.upsert(post("root", 100, "root"))]);
      assert.deepStrictEqual(yield* feed(cache), ["marker@100[root,reply]"]);
      yield* stop;
    }),
  );

  it.effect("rolls up and unrolls with realtime writes", () =>
    Effect.gen(function* () {
      const { cache, stop } = yield* withRows([
        post("root", 100, "root"),
        post("reply", 200, "root"),
      ]);
      assert.deepStrictEqual(yield* feed(cache), ["reply@200", "root@100"]);

      yield* cache.apply("a", [
        Mutation.upsert(thread("marker", 1000, "root")),
      ]);
      assert.deepStrictEqual(yield* feed(cache), ["marker@100[root,reply]"]);

      yield* cache.apply("a", [Mutation.upsert(post("late", 300, "root"))]);
      assert.deepStrictEqual(yield* feed(cache), [
        "marker@100[root,reply,late]",
      ]);

      yield* cache.apply("a", [Mutation.delete("marker")]);
      assert.deepStrictEqual(yield* feed(cache), [
        "late@300",
        "reply@200",
        "root@100",
      ]);
      yield* stop;
    }),
  );

  it.effect("lets the lowest id win when several collect one group", () =>
    Effect.gen(function* () {
      const { cache, stop } = yield* withRows([
        post("root", 100, "root"),
        thread("t2", 1000, "root"),
        thread("t1", 2000, "root"),
      ]);
      assert.deepStrictEqual(yield* feed(cache), ["t1@100[root]"]);
      yield* stop;
    }),
  );

  it.effect("pages by the roll-up's timestamp", () =>
    Effect.gen(function* () {
      const { cache, stop } = yield* withRows([
        post("newer", 400),
        post("root", 200, "root"),
        post("reply", 500, "root"),
        thread("marker", 1000, "root"),
        post("older", 100),
      ]);
      const pages: Array<Array<string>> = [];
      let before: PageCursor | undefined;
      for (let i = 0; i < 4; i++) {
        const page = yield* cache.query({ limit: 1, before });
        if (!page.length) break;
        pages.push(outline(page));
        before = page[0]!;
      }
      assert.deepStrictEqual(pages, [
        ["newer@400"],
        ["marker@200[root,reply]"],
        ["older@100"],
      ]);
      yield* stop;
    }),
  );

  it.effect("filters by type after rolling up", () =>
    Effect.gen(function* () {
      const { cache, stop } = yield* withRows([
        post("root", 100, "root"),
        post("other", 200),
        thread("marker", 1000, "root"),
      ]);
      assert.deepStrictEqual(yield* feed(cache, { types: ["post"] }), [
        "other@200",
      ]);
      assert.deepStrictEqual(yield* feed(cache, { types: ["thread"] }), [
        "marker@100[root]",
      ]);
      yield* stop;
    }),
  );

  it.effect("only rolls up within a source", () =>
    Effect.gen(function* () {
      const a = fakeSource("a");
      const b = fakeSource("b");
      a.respond = () => Effect.succeed(snap([post("root", 100, "root")], "1"));
      b.respond = () =>
        Effect.succeed(snap([thread("marker", 1000, "root")], "1"));
      const { cache, stop } = yield* boot(tempDb(), [a, b]);
      yield* cache.refresh("a");
      yield* cache.refresh("b");
      assert.deepStrictEqual(yield* feed(cache), ["root@100"]);
      yield* stop;
    }),
  );
});
