import { assert, describe, it } from "@effect/vitest";
import { Deferred, Effect, Exit, Layer, Stream } from "effect";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { type WebSocket, WebSocketServer } from "ws";
import {
  Jetstream,
  type JetstreamEvent,
  timestampCursor,
} from "../src/jetstream/Jetstream.ts";

const DID = "did:plc:testtesttesttesttesttest";
const NSID = "network.bsky.jetstream.subscribeEvents";

const frame = (payload: object) =>
  JSON.stringify({ $type: "message", payload });

const commit = (seq: number, record: object) =>
  frame({
    $type: `${NSID}#commit`,
    seq,
    did: DID,
    time: "2026-10-08T12:00:00.000Z",
    rev: "3mxafgjedwc2y",
    operation: "create",
    collection: "app.bsky.feed.post",
    rkey: "3mxafgjedwc2y",
    cid: "bafyreia7rgxu7467phwpcgzaw62l5bzmxufkpikrc5zm4q3xhjmuhq4pti",
    record,
  });

/**
 * A local Jetstream: `reject` answers the handshake with a status instead,
 * and `serve` gets each accepted connection.
 */
const server = (options: {
  readonly reject?: (url: URL) => number | undefined;
  readonly serve?: (socket: WebSocket, url: URL) => void;
}) =>
  Effect.acquireRelease(
    Effect.promise(async () => {
      const http = createServer();
      const wss = new WebSocketServer({ noServer: true });
      const urls: Array<URL> = [];
      http.on("upgrade", (request, socket, head) => {
        const url = new URL(request.url!, "http://localhost");
        urls.push(url);
        const status = options.reject?.(url);
        if (status !== undefined) {
          socket.end(
            `HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`,
          );
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) =>
          options.serve?.(ws, url),
        );
      });
      await new Promise<void>((resolve) => http.listen(0, resolve));
      const { port } = http.address() as AddressInfo;
      return { http, wss, urls, service: `http://localhost:${port}` };
    }),
    ({ http, wss }) =>
      Effect.promise(async () => {
        for (const client of wss.clients) client.terminate();
        await new Promise((resolve) => http.close(resolve));
      }),
  );

const subscribe = (
  service: string,
  options: Parameters<Jetstream["Service"]["subscribe"]>[0],
) =>
  Jetstream.use((jetstream) =>
    Effect.succeed(jetstream.subscribe(options)),
  ).pipe(Effect.provide(Jetstream.layer({ service })), Stream.unwrap);

describe("Jetstream", () => {
  it.live(
    "streams events and advisories in order, with filters and cursor in the URL",
    () =>
      Effect.gen(function* () {
        const local = yield* server({
          serve: (ws) => {
            ws.send(
              frame({
                $type: `${NSID}#info`,
                name: "OutdatedCursor",
                message: "clamped",
              }),
            );
            ws.send(
              commit(7, {
                $type: "app.bsky.feed.post",
                text: "hi",
                data: { $bytes: "aGk" },
              }),
            );
          },
        });
        const events = yield* subscribe(local.service, {
          dids: [DID],
          collections: ["app.bsky.feed.post"],
          kinds: ["commit"],
          cursor: 5,
        }).pipe(Stream.take(2), Stream.runCollect);

        const url = local.urls[0]!;
        assert.strictEqual(url.pathname, `/xrpc/${NSID}`);
        assert.deepStrictEqual(url.searchParams.getAll("dids"), [DID]);
        assert.deepStrictEqual(url.searchParams.getAll("collections"), [
          "app.bsky.feed.post",
        ]);
        assert.deepStrictEqual(url.searchParams.getAll("kinds"), ["commit"]);
        assert.strictEqual(url.searchParams.get("cursor"), "5");

        const [info, event] = events as Array<JetstreamEvent>;
        assert.deepStrictEqual(info, {
          kind: "info",
          name: "OutdatedCursor",
          message: "clamped",
        });
        assert.strictEqual(event?.kind, "commit");
        if (event?.kind !== "commit") return;
        assert.strictEqual(event.seq, 7);
        assert.strictEqual(event.commit.operation, "create");
        if (event.commit.operation === "delete") return;
        // Lex data, like a repo export's records: bytes are bytes.
        assert.strictEqual(event.commit.record.text, "hi");
        assert.instanceOf(event.commit.record.data, Uint8Array);
      }).pipe(Effect.scoped),
  );

  it.live("fails with CursorTooOld when a seq cursor is refused", () =>
    Effect.gen(function* () {
      const local = yield* server({ reject: () => 400 });
      const tooOld = yield* subscribe(local.service, { cursor: 5 }).pipe(
        Stream.runDrain,
        Effect.flip,
      );
      assert.strictEqual(tooOld._tag, "CursorTooOld");
      assert.deepInclude(tooOld, { cursor: 5 });

      // Without a seq to blame, a refusal is just an error.
      for (const cursor of [undefined, timestampCursor(Date.now())]) {
        const error = yield* subscribe(local.service, { cursor }).pipe(
          Stream.runDrain,
          Effect.flip,
        );
        assert.strictEqual(error._tag, "JetstreamError");
      }
    }).pipe(Effect.scoped),
  );

  it.live("closes the socket when the stream is done with", () =>
    Effect.gen(function* () {
      const closed = yield* Deferred.make<void>();
      const local = yield* server({
        serve: (ws) => {
          ws.on("close", () => Deferred.doneUnsafe(closed, Exit.void));
          ws.send(commit(1, { $type: "app.bsky.feed.post", text: "a" }));
        },
      });
      yield* subscribe(local.service, {}).pipe(Stream.take(1), Stream.runDrain);
      yield* Deferred.await(closed).pipe(Effect.timeout("5 seconds"));
    }).pipe(Effect.scoped),
  );
});
