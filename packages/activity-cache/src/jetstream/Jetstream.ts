import type { DidString, NsidString } from "@atproto/lex";
import {
  Jetstream as Client,
  type Kind,
  type LiveTransport,
  type TypedEvent,
  typedEventFromRaw,
  websocketTransport,
} from "@bsky/jetstream";
import {
  Context,
  Duration,
  Effect,
  Layer,
  Queue,
  Schema,
  Stream,
} from "effect";

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
 * Redials every `maxAgeMs`, however healthy the connection looks. The SDK
 * resumes each connection after the last event it delivered and drops
 * replayed duplicates, so a redial loses and repeats nothing.
 */
const recycling = (
  transport: LiveTransport,
  maxAgeMs: number,
): LiveTransport => ({
  async *stream(getUrl, signal, opts) {
    while (true) {
      const connection = AbortSignal.any([
        signal,
        AbortSignal.timeout(maxAgeMs),
      ]);
      try {
        return yield* transport.stream(getUrl, connection, opts);
      } catch (error) {
        // Only our own timeout redials; anything else is the caller's to see.
        if (signal.aborted || !connection.aborted) throw error;
      }
    }
  },
});

/**
 * Effect-native Jetstream (v2 wire) client, wrapping `@bsky/jetstream`.
 *
 * A subscription reconnects by itself through dropped connections, server
 * restarts and idle timeouts, resuming after the last event it delivered, so
 * the stream only fails when the SDK gives up. Connections are also redialed
 * every hour, since one can stay up while the server stops sending events.
 * Closing the stream (or interrupting whatever runs it) closes the socket.
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
    /** How long a connection lives before it's redialed. Default an hour. */
    readonly maxConnectionAge?: Duration.Input | undefined;
  }) =>
    Layer.sync(Jetstream, () => {
      const client = new Client(options.service);
      const maxAgeMs = Duration.toMillis(options.maxConnectionAge ?? "1 hour");

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
              const start = subscription.cursor;

              const events = client.live({
                raw: true,
                dids: subscription.dids as Array<DidString> | undefined,
                collections: subscription.collections as
                  Array<NsidString> | undefined,
                kinds: subscription.kinds && [...subscription.kinds],
                // live() only ever loads from its cursor store (saving is the
                // SDK runner's job), so this just hands it the start.
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
                // catch up. Node's transport pings every 10s, which detects
                // dead connections, but not a server that still answers pings
                // and has quietly stopped sending events, so connections are
                // also recycled on a timer.
                liveTransport: recycling(
                  websocketTransport({ idleTimeoutMs: false }),
                  maxAgeMs,
                ),
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
                    // Only a seq cursor can be refused for being too old (a
                    // timestamp one is clamped instead). If a reconnect after
                    // a long outage is refused, this is a plain error, and
                    // resubscribing from the last seq is then refused here.
                    catch: (cause) =>
                      start !== undefined &&
                      start < TIMESTAMP_CURSOR_MIN &&
                      isHandshake400(cause)
                        ? new CursorTooOld({ cursor: start })
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
