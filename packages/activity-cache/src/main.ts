import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Config, Duration, Effect, Layer, Schedule } from "effect";
import { FetchHttpClient, HttpRouter } from "effect/http";
import { mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname } from "node:path";
import { ActivityCache } from "./ActivityCache.ts";
import { ConfigLayer, required } from "./config.ts";
import { HttpLayer } from "./http.ts";
import { OidcVerifier } from "./oidc/OidcVerifier.ts";
import { Sources } from "./Source.ts";
import { makeAtprotoRepoSource } from "./sources/atproto/AtprotoRepo.ts";
import { collections } from "./sources/atproto/collections.ts";
import { Store } from "./Store.ts";

const SqlLayer = Layer.unwrap(
  Effect.gen(function* () {
    const filename = yield* Config.String("DATABASE_PATH").pipe(
      Config.withDefault("data/activity.db"),
    );
    mkdirSync(dirname(filename), { recursive: true });
    return SqliteClient.layer({ filename });
  }),
);

const SourcesLayer = Layer.effect(
  Sources,
  Effect.gen(function* () {
    const did = yield* Config.String("ATPROTO_DID").pipe(
      Config.withDefault("did:plc:2xau7wbgdq4phuou2ypwuen7"),
    );
    return [yield* makeAtprotoRepoSource({ did, collections })];
  }),
).pipe(Layer.provide(FetchHttpClient.layer));

const CacheLayer = ActivityCache.layer.pipe(
  Layer.provide([Store.layer.pipe(Layer.provide(SqlLayer)), SourcesLayer]),
);

/**
 * Rebuilds on boot and then periodically. Until realtime ingestion exists the
 * periodic rebuild is the only thing keeping the cache fresh; after that it's
 * a safety net for anything the realtime stream missed.
 */
const Maintenance = Layer.effectDiscard(
  Effect.gen(function* () {
    const cache = yield* ActivityCache;
    const interval = yield* Config.Duration("REBUILD_INTERVAL").pipe(
      Config.withDefault(Duration.minutes(15)),
    );
    yield* cache.rebuild.pipe(
      Effect.tapError((error) => Effect.logWarning("Rebuild failed", error)),
      Effect.retry({ schedule: Schedule.exponential("5 seconds"), times: 4 }),
      Effect.catch((error) => Effect.logError("Giving up on rebuild", error)),
      Effect.repeat(Schedule.spaced(interval)),
      Effect.forkScoped,
    );
    yield* cache.prune.pipe(
      Effect.repeat(Schedule.spaced("1 hour")),
      Effect.forkScoped,
    );
  }),
);

/** Only the site's server may call the API, with a token from the site's OpenID provider. */
const OidcLayer = Layer.unwrap(
  Effect.gen(function* () {
    // A string, not Config.URL: issuers are compared exactly, and URL parsing
    // would add a trailing slash to a bare origin.
    const issuer = yield* required("OIDC_ISSUER");
    const audience = yield* required("OIDC_AUDIENCE");
    return OidcVerifier.layer({ issuer, audience });
  }),
).pipe(Layer.provide(FetchHttpClient.layer));

const ServerLayer = HttpRouter.serve(HttpLayer).pipe(
  Layer.provide(OidcLayer),
  Layer.provide(
    NodeHttpServer.layerConfig(createServer, {
      port: Config.Port("PORT").pipe(Config.withDefault(3001)),
    }),
  ),
);

Layer.mergeAll(ServerLayer, Maintenance).pipe(
  Layer.provide(CacheLayer),
  Layer.provide(ConfigLayer),
  Layer.launch,
  NodeRuntime.runMain,
);
