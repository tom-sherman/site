import { assert, describe, it } from "@effect/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { Duration, Effect, Layer, Redacted } from "effect";
import { TestClock } from "effect/testing";
import {
  HttpClient,
  HttpClientError,
  HttpClientResponse,
  HttpRouter,
  HttpServer,
} from "effect/http";
import { ActivityCache } from "../src/ActivityCache.ts";
import { HttpLayer } from "../src/http.ts";
import { OidcVerifier } from "../src/oidc/OidcVerifier.ts";

const ISSUER = "https://site.example";
const AUDIENCE = "https://activity.example";

const b64url = (data: string | ArrayBuffer) =>
  Buffer.from(typeof data === "string" ? data : new Uint8Array(data)).toString(
    "base64url",
  );

const makeKey = async (kid: string) => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    kid,
    privateKey: pair.privateKey,
    jwk: { ...jwk, kid, alg: "ES256", use: "sig" },
  };
};
type Key = Awaited<ReturnType<typeof makeKey>>;

const signingKey = await makeKey("current");
const strangerKey = await makeKey("stranger");
const nextKey = await makeKey("next");

const now = () => Math.floor(Date.now() / 1000);

const sign = async (
  key: Key,
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
) => {
  const input = [
    b64url(
      JSON.stringify({ alg: "ES256", typ: "at+jwt", kid: key.kid, ...header }),
    ),
    b64url(
      JSON.stringify({
        iss: ISSUER,
        aud: AUDIENCE,
        sub: "site",
        client_id: "site",
        jti: crypto.randomUUID(),
        iat: now(),
        exp: now() + 60,
        ...claims,
      }),
    ),
  ].join(".");
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key.privateKey,
    new TextEncoder().encode(input),
  );
  return Redacted.make(`${input}.${b64url(signature)}`);
};

/** A fake issuer. `state` lets tests break it mid-way. */
const makeIssuer = () => {
  const state = {
    metadataIssuer: ISSUER,
    /** Where the metadata says the keys are. Any other JWKS path is dead. */
    jwksPath: "/jwks",
    keys: [signingKey.jwk] as Array<Key["jwk"]>,
    /** Network failure on every JWKS request. */
    jwksDown: false,
    /** Answer JWKS requests with this status instead of the keys. */
    jwksStatus: 200,
    discoveryRequests: 0,
    jwksRequests: 0,
  };
  const layer = Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request, url) => {
      const respond = (response: Response) =>
        Effect.succeed(HttpClientResponse.fromWeb(request, response));
      const unreachable = Effect.fail(
        new HttpClientError.HttpClientError({
          reason: new HttpClientError.TransportError({ request }),
        }),
      );
      if (url.href === `${ISSUER}/.well-known/openid-configuration`) {
        state.discoveryRequests++;
        return respond(
          Response.json({
            issuer: state.metadataIssuer,
            jwks_uri: `${ISSUER}${state.jwksPath}`,
          }),
        );
      }
      if (url.pathname.startsWith("/jwks")) {
        state.jwksRequests++;
        if (state.jwksDown || url.pathname !== state.jwksPath)
          return unreachable;
        if (state.jwksStatus !== 200) {
          return respond(new Response("oops", { status: state.jwksStatus }));
        }
        return respond(Response.json({ keys: state.keys }));
      }
      return respond(new Response(null, { status: 404 }));
    }),
  );
  return { state, layer };
};

const makeBrokenIssuer = () => {
  const issuer = makeIssuer();
  issuer.state.metadataIssuer = "https://evil.example";
  return issuer;
};

const verifierLayer = (issuer: ReturnType<typeof makeIssuer>) =>
  OidcVerifier.layer({ issuer: ISSUER, audience: AUDIENCE }).pipe(
    Layer.provide(issuer.layer),
  );

const verify = (token: Redacted.Redacted<string>) =>
  OidcVerifier.use((verifier) => verifier.verify(token));

describe("OidcVerifier", () => {
  it.effect("accepts a token from the issuer for this audience", () =>
    Effect.gen(function* () {
      const token = yield* Effect.promise(() => sign(signingKey));
      const claims = yield* verify(token);
      assert.strictEqual(claims.iss, ISSUER);
      assert.strictEqual(claims.sub, "site");
    }).pipe(Effect.provide(verifierLayer(makeIssuer()))),
  );

  const rejected: Array<[string, () => Promise<Redacted.Redacted<string>>]> = [
    [
      "another audience",
      () => sign(signingKey, { aud: "https://other.example" }),
    ],
    ["another issuer", () => sign(signingKey, { iss: "https://evil.example" })],
    [
      "an expired token",
      () => sign(signingKey, { exp: now() - 3600, iat: now() - 7200 }),
    ],
    ["an unknown key", () => sign(strangerKey)],
    ["a forged kid", () => sign(strangerKey, {}, { kid: "current" })],
    ["a non-access-token typ", () => sign(signingKey, {}, { typ: "JWT" })],
    [
      "alg none",
      async () => {
        const [, payload] = Redacted.value(await sign(signingKey)).split(".");
        return Redacted.make(
          `${b64url(JSON.stringify({ alg: "none", typ: "at+jwt" }))}.${payload}.`,
        );
      },
    ],
    ["garbage", () => Promise.resolve(Redacted.make("not-a-jwt"))],
    ["an empty token", () => Promise.resolve(Redacted.make(""))],
  ];
  for (const [name, makeToken] of rejected) {
    it.effect(`rejects ${name}`, () =>
      Effect.gen(function* () {
        const error = yield* verify(yield* Effect.promise(makeToken)).pipe(
          Effect.flip,
        );
        assert.strictEqual(error._tag, "InvalidAccessToken");
      }).pipe(Effect.provide(verifierLayer(makeIssuer()))),
    );
  }

  it.effect("accepts an audience that isn't a URL", () =>
    Effect.gen(function* () {
      const token = yield* Effect.promise(() =>
        sign(signingKey, { aud: "activity-cache" }),
      );
      yield* verify(token);
    }).pipe(
      Effect.provide(
        OidcVerifier.layer({ issuer: ISSUER, audience: "activity-cache" }).pipe(
          Layer.provide(makeIssuer().layer),
        ),
      ),
    ),
  );

  it.effect("refuses an issuer whose metadata names someone else", () => {
    const issuer = makeIssuer();
    issuer.state.metadataIssuer = "https://evil.example";
    return Effect.gen(function* () {
      const token = yield* Effect.promise(() => sign(signingKey));
      const error = yield* verify(token).pipe(Effect.flip);
      assert.strictEqual(error._tag, "IssuerUnavailable");
    }).pipe(Effect.provide(verifierLayer(issuer)));
  });

  describe("discovery caching", () => {
    it.effect("shares one discovery between concurrent requests", () => {
      const issuer = makeIssuer();
      return Effect.gen(function* () {
        const token = yield* Effect.promise(() => sign(signingKey));
        yield* Effect.all(
          Array.from({ length: 10 }, () => verify(token)),
          {
            concurrency: "unbounded",
          },
        );
        assert.strictEqual(issuer.state.discoveryRequests, 1);
      }).pipe(Effect.provide(verifierLayer(issuer)));
    });

    it.effect("remembers a failure briefly, then retries", () => {
      const issuer = makeIssuer();
      issuer.state.metadataIssuer = "https://evil.example";
      return Effect.gen(function* () {
        const token = yield* Effect.promise(() => sign(signingKey));
        yield* verify(token).pipe(Effect.flip);
        issuer.state.metadataIssuer = ISSUER;

        // Within the retry window the failure is reused, not refetched.
        const error = yield* verify(token).pipe(Effect.flip);
        assert.strictEqual(error._tag, "IssuerUnavailable");
        assert.strictEqual(issuer.state.discoveryRequests, 1);

        yield* TestClock.adjust("5 seconds");
        yield* verify(token);
        assert.strictEqual(issuer.state.discoveryRequests, 2);
      }).pipe(Effect.provide(verifierLayer(issuer)));
    });

    it.effect("refreshes metadata after an hour", () => {
      const issuer = makeIssuer();
      return Effect.gen(function* () {
        const token = yield* Effect.promise(() => sign(signingKey));
        yield* verify(token);
        yield* TestClock.adjust("59 minutes");
        yield* verify(token);
        assert.strictEqual(issuer.state.discoveryRequests, 1);

        yield* TestClock.adjust("1 minute");
        yield* verify(token);
        assert.strictEqual(issuer.state.discoveryRequests, 2);
      }).pipe(Effect.provide(verifierLayer(issuer)));
    });

    it.effect("keeps using the last good metadata when a refresh fails", () => {
      const issuer = makeIssuer();
      return Effect.gen(function* () {
        const token = yield* Effect.promise(() => sign(signingKey));
        yield* verify(token);

        issuer.state.metadataIssuer = "https://evil.example";
        yield* TestClock.adjust("1 hour");
        yield* verify(token);
        assert.strictEqual(issuer.state.discoveryRequests, 2);

        // Stale metadata is only trusted until the next retry.
        yield* verify(token);
        assert.strictEqual(issuer.state.discoveryRequests, 2);
        issuer.state.metadataIssuer = ISSUER;
        yield* TestClock.adjust("5 seconds");
        yield* verify(token);
        assert.strictEqual(issuer.state.discoveryRequests, 3);

        // Back to the full hour once a refresh succeeds.
        yield* TestClock.adjust("59 minutes");
        yield* verify(token);
        assert.strictEqual(issuer.state.discoveryRequests, 3);
      }).pipe(Effect.provide(verifierLayer(issuer)));
    });
  });

  it.effect(
    "reports an unreachable JWKS as the issuer being unavailable",
    () => {
      const issuer = makeIssuer();
      issuer.state.jwksDown = true;
      return Effect.gen(function* () {
        const token = yield* Effect.promise(() => sign(signingKey));
        const error = yield* verify(token).pipe(Effect.flip);
        assert.strictEqual(error._tag, "IssuerUnavailable");
        // One line naming the failed request, not openid-client's generic wrapper.
        assert.match(
          error.message,
          /^Couldn't fetch the issuer's JWKS for https:\/\/site\.example: Transport error \(GET https:\/\/site\.example\/jwks\)/,
        );
      }).pipe(Effect.provide(verifierLayer(issuer)));
    },
  );
});

describe("key rotation", () => {
  // oauth4webapi times its JWKS cache with Date.now(), while discovery caching
  // uses Effect's Clock, so tests move both together.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.parse("2026-10-07T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const advance = (duration: Duration.Input) =>
    Effect.gen(function* () {
      vi.setSystemTime(Date.now() + Duration.toMillis(duration));
      yield* TestClock.adjust(duration);
    });
  const signWith = (key: Key) => Effect.promise(() => sign(key));

  it.effect("picks up a key published before it's used", () => {
    const issuer = makeIssuer();
    return Effect.gen(function* () {
      yield* verify(yield* signWith(signingKey));
      issuer.state.keys = [signingKey.jwk, nextKey.jwk];

      yield* advance("5 minutes");
      yield* verify(yield* signWith(nextKey));
      yield* verify(yield* signWith(signingKey));
      assert.strictEqual(issuer.state.jwksRequests, 2);
    }).pipe(Effect.provide(verifierLayer(issuer)));
  });

  it.effect(
    "rejects an abrupt rotation for up to a minute, then accepts it",
    () => {
      const issuer = makeIssuer();
      return Effect.gen(function* () {
        yield* verify(yield* signWith(signingKey));
        issuer.state.keys = [nextKey.jwk];

        yield* advance("30 seconds");
        const early = yield* verify(yield* signWith(nextKey)).pipe(Effect.flip);
        assert.strictEqual(early._tag, "InvalidAccessToken");
        assert.strictEqual(issuer.state.jwksRequests, 1);

        yield* advance("30 seconds");
        yield* verify(yield* signWith(nextKey));
        assert.strictEqual(issuer.state.jwksRequests, 2);

        // The refetched key set no longer has the old key.
        const old = yield* verify(yield* signWith(signingKey)).pipe(
          Effect.flip,
        );
        assert.strictEqual(old._tag, "InvalidAccessToken");
      }).pipe(Effect.provide(verifierLayer(issuer)));
    },
  );

  it.effect("accepts a removed key until the cached key set expires", () => {
    const issuer = makeIssuer();
    issuer.state.keys = [signingKey.jwk, nextKey.jwk];
    return Effect.gen(function* () {
      yield* verify(yield* signWith(signingKey));
      issuer.state.keys = [nextKey.jwk];

      yield* advance("4 minutes");
      yield* verify(yield* signWith(signingKey));

      yield* advance("1 minute");
      const error = yield* verify(yield* signWith(signingKey)).pipe(
        Effect.flip,
      );
      assert.strictEqual(error._tag, "InvalidAccessToken");
    }).pipe(Effect.provide(verifierLayer(issuer)));
  });

  it.effect(
    "follows a moved jwks_uri without waiting for the metadata refresh",
    () => {
      const issuer = makeIssuer();
      return Effect.gen(function* () {
        yield* verify(yield* signWith(signingKey));
        issuer.state.jwksPath = "/jwks-v2";
        issuer.state.keys = [nextKey.jwk];

        // Once the cached keys expire, the old URL fails...
        yield* advance("5 minutes");
        const error = yield* verify(yield* signWith(nextKey)).pipe(Effect.flip);
        assert.strictEqual(error._tag, "IssuerUnavailable");

        // ...which triggers rediscovery, finding the new one.
        yield* verify(yield* signWith(nextKey));
        assert.strictEqual(issuer.state.discoveryRequests, 2);
      }).pipe(Effect.provide(verifierLayer(issuer)));
    },
  );

  it.effect(
    "treats a JWKS error response as the issuer being unavailable",
    () => {
      const issuer = makeIssuer();
      issuer.state.jwksStatus = 500;
      return Effect.gen(function* () {
        const error = yield* verify(yield* signWith(signingKey)).pipe(
          Effect.flip,
        );
        assert.strictEqual(error._tag, "IssuerUnavailable");
      }).pipe(Effect.provide(verifierLayer(issuer)));
    },
  );

  it.effect(
    "rediscovers at most once per retry window while the JWKS is down",
    () => {
      const issuer = makeIssuer();
      issuer.state.jwksDown = true;
      return Effect.gen(function* () {
        const token = yield* signWith(signingKey);
        for (let i = 0; i < 3; i++) yield* Effect.flip(verify(token));
        // The first failure rediscovers; later ones inside the window don't.
        assert.strictEqual(issuer.state.discoveryRequests, 2);

        yield* advance("5 seconds");
        yield* Effect.flip(verify(token));
        yield* Effect.flip(verify(token));
        assert.strictEqual(issuer.state.discoveryRequests, 3);
      }).pipe(Effect.provide(verifierLayer(issuer)));
    },
  );
});

describe("API authorization", () => {
  const makeHandler = (issuer: ReturnType<typeof makeIssuer>) =>
    HttpRouter.toWebHandler(
      HttpLayer.pipe(
        Layer.provide(verifierLayer(issuer)),
        Layer.provide(
          Layer.succeed(
            ActivityCache,
            ActivityCache.of({
              apply: () => Effect.void,
              refresh: () => Effect.void,
              run: Effect.never,
              query: () => Effect.succeed([]),
              prune: Effect.void,
              status: Effect.succeed([]),
            }),
          ),
        ),
        Layer.provide(HttpServer.layerServices),
      ),
      { disableLogger: true },
    );

  const request = async (
    issuer: ReturnType<typeof makeIssuer>,
    path: string,
    token?: Redacted.Redacted<string>,
  ) => {
    const { handler, dispose } = makeHandler(issuer);
    try {
      const response = await handler(
        new Request(`http://localhost${path}`, {
          headers: token
            ? { authorization: `Bearer ${Redacted.value(token)}` }
            : {},
        }),
      );
      return response.status;
    } finally {
      await dispose();
    }
  };

  it.live("requires a valid token for /activity", () =>
    Effect.promise(async () => {
      const issuer = makeIssuer();
      assert.strictEqual(await request(issuer, "/activity"), 401);
      assert.strictEqual(
        await request(issuer, "/activity", await sign(strangerKey)),
        401,
      );
      assert.strictEqual(
        await request(issuer, "/activity", await sign(signingKey)),
        200,
      );
    }),
  );

  it.live("returns 503 when the issuer can't be reached", () =>
    Effect.promise(async () => {
      const issuer = makeIssuer();
      issuer.state.jwksDown = true;
      assert.strictEqual(
        await request(issuer, "/activity", await sign(signingKey)),
        503,
      );
      // A missing token is the caller's problem, even while discovery is failing.
      assert.strictEqual(await request(makeBrokenIssuer(), "/activity"), 401);
    }),
  );

  it.live("leaves /status open", () =>
    Effect.promise(async () => {
      assert.strictEqual(await request(makeIssuer(), "/status"), 200);
    }),
  );
});
