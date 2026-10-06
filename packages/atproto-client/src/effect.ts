import {
  getMain,
  xrpcSafe,
  type AgentConfig,
  type InferOutput,
  type Main,
  type ParseOptions,
  type Procedure,
  type Query,
  type Schema as LexSchema,
  type XrpcOptions,
  type XrpcResponse,
} from "@atproto/lex";
import { Effect, Schema } from "effect";
import { HttpBody, HttpClient, HttpClientRequest } from "effect/http";

/**
 * An XRPC call failed: the service returned an error, the response didn't
 * match the method's schema, or the request never completed.
 */
export class XrpcError extends Schema.TaggedError<XrpcError>()("XrpcError", {
  /** NSID of the method that was called. */
  nsid: Schema.String,
  /** Lexicon error name, e.g. `RepoNotFound`, `InvalidResponse`, `InternalServerError`. */
  error: Schema.String,
  /** HTTP status, when the service responded at all. */
  status: Schema.optional(Schema.Number),
  message: Schema.String,
  /** lex's own judgement of whether retrying could help (5xx, 429, network failures). */
  retryable: Schema.Boolean,
  cause: Schema.Defect(),
}) {}

/** A value didn't match a lexicon schema. */
export class LexParseError extends Schema.TaggedError<LexParseError>()(
  "LexParseError",
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

/** Where to send XRPC requests. Same as lex's agent options, minus `fetch`, which comes from `HttpClient`. */
export type XrpcService = string | URL | Omit<AgentConfig, "fetch">;

type XrpcArgs<M extends Query | Procedure> = Omit<XrpcOptions<M>, "signal">;

/**
 * Effect-native `xrpc`. Requests go through the `HttpClient` in context (so
 * they're traced, interruptible and swappable in tests), while lex still
 * handles encoding, response validation and error decoding.
 *
 * Retries are left to the caller (`Effect.retry` with `XrpcError.retryable`)
 * rather than lex's built-in retry loop.
 */
export const xrpc = <const M extends Query | Procedure>(
  service: XrpcService,
  method: Main<M>,
  ...[options]: NonNullable<unknown> extends XrpcArgs<M>
    ? [options?: XrpcArgs<M>]
    : [options: XrpcArgs<M>]
): Effect.Effect<XrpcResponse<M>, XrpcError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const fetch = yield* makeFetch;
    const config: AgentConfig =
      typeof service === "string" || service instanceof URL
        ? { service, fetch }
        : { ...service, fetch };
    const result = yield* Effect.promise((signal) =>
      xrpcSafe(config, method, {
        ...options,
        signal,
      } as XrpcOptions<M>),
    );
    if (result.success) return result;
    return yield* new XrpcError({
      nsid: getMain(method).nsid,
      error: result.error,
      status: "status" in result ? result.status : undefined,
      message: result.message,
      retryable: result.shouldRetry(),
      cause: result,
    });
  }).pipe(
    Effect.withSpan("xrpc", { attributes: { nsid: getMain(method).nsid } }),
  );

/**
 * Effect-native `$parse`: decodes `input` against a lexicon schema (or a
 * generated namespace such as `app.bsky.feed.post`).
 */
export const parse = <S extends LexSchema>(
  schema: Main<S>,
  input: unknown,
  options?: ParseOptions,
): Effect.Effect<InferOutput<S>, LexParseError> =>
  Effect.suspend(() => {
    const result = getMain(schema).safeParse(input, options);
    return result.success
      ? Effect.succeed(result.value as InferOutput<S>)
      : Effect.fail(
          new LexParseError({
            message: result.reason.message,
            cause: result.reason,
          }),
        );
  });

/**
 * A WHATWG `fetch` backed by the `HttpClient` in context, for handing to lex.
 * Bodies are buffered because an `HttpClient` response only lives as long as
 * the effect that produced it.
 */
const makeFetch = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;
  const context = yield* Effect.context<never>();
  const runPromise = Effect.runPromiseWith(context);

  const fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const webRequest = new Request(input, init);
    const body = webRequest.body
      ? HttpBody.uint8Array(
          new Uint8Array(await webRequest.arrayBuffer()),
          webRequest.headers.get("content-type") ?? undefined,
        )
      : HttpBody.empty;
    const request = HttpClientRequest.fromWeb(webRequest).pipe(
      HttpClientRequest.setBody(body),
    );
    return runPromise(
      Effect.gen(function* () {
        const response = yield* client.execute(request);
        const buffer = yield* response.arrayBuffer;
        return new Response(
          NULL_BODY_STATUSES.has(response.status) ? null : buffer,
          { status: response.status, headers: response.headers },
        );
      }),
      { signal: webRequest.signal },
    );
  };
  return fetch as typeof globalThis.fetch;
});

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);
