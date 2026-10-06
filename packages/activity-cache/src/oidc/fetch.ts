import { Effect } from "effect";
import { HttpBody, HttpClient, HttpClientRequest } from "effect/http";
import type { CustomFetch } from "openid-client";

/**
 * A `customFetch` for openid-client / oauth4webapi that sends requests through
 * the `HttpClient` in context. Bodies are buffered because an `HttpClient`
 * response only lives as long as the effect that produced it.
 */
export const makeCustomFetch = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;
  const runPromise = Effect.runPromiseWith(yield* Effect.context<never>());

  const customFetch: CustomFetch = (url, options) =>
    runPromise(
      Effect.gen(function* () {
        const response = yield* client.execute(
          HttpClientRequest.make(options.method as "GET")(url, {
            headers: options.headers,
            body:
              options.body === undefined
                ? HttpBody.empty
                : HttpBody.raw(options.body),
          }),
        );
        const body = yield* response.arrayBuffer;
        return new Response(
          NULL_BODY_STATUSES.has(response.status) ? null : body,
          { status: response.status, headers: response.headers },
        );
      }),
      { signal: options.signal },
    );
  return customFetch;
});

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);
