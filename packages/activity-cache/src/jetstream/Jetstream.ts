import type { DidString, NsidString } from "@atproto/lex";
import {
  Jetstream as Client,
  type Kind,
  type TypedEvent,
  typedEventFromRaw,
  websocketTransport,
} from "@bsky/jetstream";
import { Context, Effect, Layer, Queue, Schema, Stream } from "effect";

export class JetstreamError extends Schema.TaggedError<JetstreamError>()(
  "JetstreamError",
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

/**
 * The server no longer has events back to `cursor` (a seq), so it can't
 * resume from there. Whatever happened in between has been missed.
 */
export class CursorTooOld extends Schema.TaggedError<CursorTooOld>()(
  "CursorTooOld",
  { cursor: Schema.Number },
) {
  override get message() {
    return `Jetstream can't resume from seq ${this.cursor}: it's older than the server keeps`;
  }
}

/**
 * A server advisory, in order with the events around it. `OutdatedCursor`
 * means a timestamp cursor was older than the server keeps, so the stream
 * started at the oldest event it has instead.
 */
export interface JetstreamInfo {
  readonly kind: "info";
  readonly name: string;
  readonly message: string | undefined;
}

/**
 * Commit records are lex data (CIDs, bytes and blob refs as objects, like a
 * repo export's), not validated against any schema. A record that couldn't
 * be converted at all has `validationError` set and no `record`, rather than
 * the event being dropped, so a consumer still sees that the record changed.
 */
export type JetstreamEvent = TypedEvent | JetstreamInfo;

export interface SubscribeOptions {
  readonly dids?: ReadonlyArray<string> | undefined;
  readonly collections?: ReadonlyArray<string> | undefined;
  /** Omitted means every kind: commits, identity, account and sync events. */
  readonly kinds?: ReadonlyArray<Kind> | undefined;
  /**
   * Resume after this seq, or start from a unix-microsecond timestamp
   * (`timestampCursor`). Omitted, the stream starts at the live tip.
   */
  readonly cursor?: number | undefined;
}

/** v2 cursors at or above this are unix-microsecond timestamps, not seqs. */
const TIMESTAMP_CURSOR_MIN = 1e15;

/** A cursor that starts the stream at `epochMs`. */
export const timestampCursor = (epochMs: number) => Math.floor(epochMs * 1000);

/**
 * The SDK rejects a seq cursor older than the server keeps with a `400` on
 * the websocket handshake, which is only visible in the message of the
 * socket error's cause. Same stopgap the SDK uses internally.
 */
const isHandshake400 = (error: unknown) =>
  error instanceof Error &&
  error.cause instanceof Error &&
  /Unexpected server response: 400\b/.test(error.cause.message);

const noSchemas = new Map();

/**
 * Effect-native Jetstream (v2 wire) client, wrapping `@bsky/jetstream`.
 *
 * A subscription reconnects by itself through dropped connections, server
 * restarts and idle timeouts, resuming after the last event it delivered, so
 * the stream only fails when the SDK gives up. Closing the stream (or
 * interrupting whatever runs it) closes the socket.
 */
export class Jetstream extends Context.Service<
  Jetstream,
  {
    readonly subscribe: (
      options: SubscribeOptions,
    ) => Stream.Stream<JetstreamEvent, JetstreamError | CursorTooOld>;
  }
>()("activity-cache/Jetstream") {
  static readonly layer = (options: {
    /** e.g. `https://jetstream.us-east.bsky.network`. Must speak v2. */
    readonly service: string;
  }) =>
    Layer.sync(Jetstream, () => {
      const client = new Client(options.service);

      const subscribe = (subscription: SubscribeOptions) =>
        Stream.callback<JetstreamEvent, JetstreamError | CursorTooOld>(
          (queue) =>
            Effect.gen(function* () {
              const controller = new AbortController();
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => controller.abort()),
              );

              // Advisories and skipped frames arrive through callbacks while
              // the SDK is between events; they're flushed in order below.
              const infos: Array<JetstreamInfo> = [];
              const skipped: Array<Error> = [];
              // Where the SDK resumes from when it reconnects.
              let position = subscription.cursor;
              const start = subscription.cursor;

              const events = client.live({
                raw: true,
                dids: subscription.dids as Array<DidString> | undefined,
                collections: subscription.collections as
                  Array<NsidString> | undefined,
                kinds: subscription.kinds && [...subscription.kinds],
                cursor:
                  start === undefined
                    ? undefined
                    : { load: async () => start, save: async () => {} },
                signal: controller.signal,
                onInfo: (info) =>
                  infos.push({
                    kind: "info",
                    name: info.name,
                    message: info.message,
                  }),
                onError: (error) => skipped.push(error),
                // The SDK redials after 60s without a message, assuming the
                // firehose never goes quiet. A filtered one does, and each
                // redial makes the server scan everything since the cursor,
                // which for a quiet account can outlast the timeout and never
                // catch up. Node's transport pings every 10s, which already
                // detects dead connections.
                liveTransport: websocketTransport({ idleTimeoutMs: false }),
              });

              const flush = Effect.gen(function* () {
                for (const error of skipped.splice(0)) {
                  yield* Effect.logWarning("Skipped a malformed frame", error);
                }
                for (const info of infos.splice(0)) {
                  yield* Queue.offer(queue, info);
                }
              });

              yield* Effect.gen(function* () {
                while (true) {
                  const next = yield* Effect.tryPromise({
                    try: () => events.next(),
                    catch: (cause) =>
                      position !== undefined &&
                      position < TIMESTAMP_CURSOR_MIN &&
                      isHandshake400(cause)
                        ? new CursorTooOld({ cursor: position })
                        : new JetstreamError({
                            message:
                              cause instanceof Error
                                ? cause.message
                                : String(cause),
                            cause,
                          }),
                  });
                  yield* flush;
                  if (next.done) return yield* Queue.end(queue);
                  position = next.value.seq;
                  yield* Queue.offer(
                    queue,
                    typedEventFromRaw(next.value, noSchemas),
                  );
                }
              }).pipe(
                Effect.catch((error) =>
                  flush.pipe(Effect.andThen(Queue.fail(queue, error))),
                ),
                Effect.forkScoped,
              );
            }),
          { bufferSize: 16, strategy: "suspend" },
        );

      return Jetstream.of({ subscribe });
    });
}
