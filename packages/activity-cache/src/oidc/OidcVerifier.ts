import {
  Cache,
  Clock,
  Context,
  Duration,
  Effect,
  Exit,
  Layer,
  Redacted,
  Schema,
} from "effect";
import { HttpClientError } from "effect/http";
import * as oauth from "oauth4webapi";
import * as client from "openid-client";
import { makeCustomFetch } from "./fetch.ts";

/** The token is missing, malformed, expired, for someone else, or not signed by the issuer. */
export class InvalidAccessToken extends Schema.TaggedError<InvalidAccessToken>()(
  "InvalidAccessToken",
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

/** Discovery or the JWKS fetch failed, so no token can be checked right now. */
export class IssuerUnavailable extends Schema.TaggedError<IssuerUnavailable>()(
  "IssuerUnavailable",
  {
    issuer: Schema.String,
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export type AccessTokenClaims = oauth.JWTAccessTokenClaims;

export interface OidcVerifierOptions {
  /** Issuer identifier. Discovery requires the issuer's metadata to name exactly this. */
  readonly issuer: string;
  /** This resource server's identifier; tokens must list it in `aud`. */
  readonly audience: string;
  /** How long discovered metadata is used before it's fetched again. Default 1 hour. */
  readonly metadataTtl?: Duration.Input | undefined;
  /** How long a failed discovery is remembered before retrying. Default 5 seconds. */
  readonly retryAfter?: Duration.Input | undefined;
}

/**
 * Verifies RFC 9068 JWT access tokens from one OpenID provider.
 *
 * Discovery uses openid-client, which rejects metadata whose `issuer` doesn't
 * match. Tokens are then checked with oauth4webapi's
 * `validateJwtAccessToken` (signature against the issuer's JWKS, `typ:
 * at+jwt`, `iss`, `aud`, `exp`). All HTTP goes through `HttpClient`.
 *
 * Discovery happens on first use, so the service can start while the issuer
 * is down. Concurrent requests share one discovery attempt. Metadata is
 * refetched after `metadataTtl`; a failure is remembered for `retryAfter` so
 * an outage doesn't mean one discovery attempt per request. If a refresh
 * fails, the last good metadata keeps being used until a retry succeeds.
 */
export class OidcVerifier extends Context.Service<
  OidcVerifier,
  {
    readonly verify: (
      token: Redacted.Redacted<string>,
    ) => Effect.Effect<
      AccessTokenClaims,
      InvalidAccessToken | IssuerUnavailable
    >;
  }
>()("activity-cache/OidcVerifier") {
  static readonly make = Effect.fn("OidcVerifier.make")(function* (
    options: OidcVerifierOptions,
  ) {
    const customFetch = yield* makeCustomFetch;
    // http:// is only allowed for a local issuer, e.g. `next dev`.
    const allowInsecure = isLoopback(new URL(options.issuer));
    // Seeds for oauth4webapi's JWKS cache, which is keyed by the metadata
    // object, so a metadata refresh doesn't refetch still-fresh keys. Keyed by
    // jwks_uri so keys never carry over to a different key set.
    const jwksCaches = new Map<string, oauth.JWKSCacheInput>();
    const metadataTtl = options.metadataTtl ?? Duration.hours(1);
    const retryAfter = options.retryAfter ?? Duration.seconds(5);

    const unavailable = (message: string) => (cause: unknown) =>
      new IssuerUnavailable({
        issuer: options.issuer,
        message: `${message} for ${options.issuer}: ${describeCause(cause)}`,
        cause,
      });

    const fetchMetadata = Effect.tryPromise({
      try: () =>
        client.discovery(
          new URL(options.issuer),
          // openid-client is built for clients; as a resource server our
          // audience is the closest thing we have to a client id.
          options.audience,
          undefined,
          client.None(),
          {
            [client.customFetch]: customFetch,
            execute: allowInsecure ? [client.allowInsecureRequests] : [],
          },
        ),
      catch: unavailable("Discovery failed"),
    }).pipe(Effect.map((config) => config.serverMetadata()));

    let lastGood: oauth.AuthorizationServer | undefined;
    const discovery = yield* Cache.makeWith(
      (_: void) =>
        fetchMetadata.pipe(
          Effect.map((metadata) => {
            lastGood = metadata;
            return { metadata, stale: false };
          }),
          Effect.catch((error) =>
            lastGood
              ? Effect.logWarning(
                  `${error.message}; using previous metadata`,
                ).pipe(Effect.as({ metadata: lastGood, stale: true }))
              : Effect.fail(error),
          ),
        ),
      {
        capacity: 1,
        timeToLive: (exit) =>
          Exit.isSuccess(exit) && !exit.value.stale ? metadataTtl : retryAfter,
      },
    );
    const discover = Cache.get(discovery, undefined).pipe(
      Effect.map(({ metadata }) => metadata),
    );

    // When the keys can't be fetched, the metadata may be pointing at an old
    // jwks_uri, so rediscover. At most once per `retryAfter`, so an outage of
    // just the JWKS endpoint doesn't turn every request into a discovery.
    let lastInvalidation = -Infinity;
    const rediscover = Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      if (now - lastInvalidation < Duration.toMillis(retryAfter)) return;
      lastInvalidation = now;
      yield* Cache.invalidate(discovery, undefined);
    });

    const verify = Effect.fn("OidcVerifier.verify")(function* (
      token: Redacted.Redacted<string>,
    ) {
      if (Redacted.value(token) === "") {
        return yield* new InvalidAccessToken({
          message: "Missing bearer token",
          cause: undefined,
        });
      }
      const as = yield* discover;
      const jwksUri = as.jwks_uri ?? "";
      let jwksCache = jwksCaches.get(jwksUri);
      if (!jwksCache) {
        jwksCache = {};
        jwksCaches.clear();
        jwksCaches.set(jwksUri, jwksCache);
      }
      return yield* Effect.tryPromise({
        try: (signal) =>
          oauth.validateJwtAccessToken(
            as,
            // Only the Authorization header is read. The URL only matters for
            // DPoP, which isn't used, and the audience needn't be a URL.
            new Request("http://localhost/", {
              headers: { authorization: `Bearer ${Redacted.value(token)}` },
            }),
            options.audience,
            {
              signal,
              [oauth.customFetch]: customFetch,
              [oauth.jwksCache]: jwksCache,
              [oauth.allowInsecureRequests]: allowInsecure,
            },
          ),
        catch: (cause) =>
          isKeyFetchFailure(cause)
            ? unavailable("Couldn't fetch the issuer's JWKS")(cause)
            : new InvalidAccessToken({
                message:
                  cause instanceof Error ? cause.message : "Invalid token",
                cause,
              }),
      }).pipe(Effect.tapErrorTag("IssuerUnavailable", () => rediscover));
    });

    return OidcVerifier.of({ verify });
  });

  static readonly layer = (options: OidcVerifierOptions) =>
    Layer.effect(OidcVerifier, OidcVerifier.make(options));
}

const isLoopback = (url: URL) =>
  url.hostname === "localhost" ||
  url.hostname === "127.0.0.1" ||
  url.hostname === "[::1]";

/** `HttpClient` failures surface from `customFetch`, possibly wrapped by oauth4webapi. */
const isNetworkFailure = (error: unknown): boolean =>
  HttpClientError.isHttpClientError(error) ||
  (error instanceof Error &&
    error.cause !== undefined &&
    isNetworkFailure(error.cause));

/**
 * One line saying what went wrong. Transport failures are wrapped several
 * times ("something went wrong" > "Transport error (GET …)" > "fetch failed"
 * > "connect ECONNREFUSED …"), so for those use the request and the root cause.
 */
const describeCause = (cause: unknown): string => {
  const chain: Array<unknown> = [];
  for (let c = cause; c !== undefined; c = (c as { cause?: unknown }).cause) {
    chain.push(c);
  }
  const request = chain.find(HttpClientError.isHttpClientError);
  const root = chain.at(-1);
  const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
  return request && root !== request
    ? `${request.message}: ${message(root)}`
    : message(cause);
};

/**
 * The JWKS couldn't be fetched: a network failure, or a non-200 / non-JSON
 * response. The JWKS request is the only HTTP call made while validating a
 * token, so these codes can't come from anything else.
 */
const isKeyFetchFailure = (error: unknown): boolean =>
  isNetworkFailure(error) ||
  (error instanceof oauth.OperationProcessingError &&
    (error.code === oauth.RESPONSE_IS_NOT_CONFORM ||
      error.code === oauth.RESPONSE_IS_NOT_JSON));
