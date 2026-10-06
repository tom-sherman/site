# @repo/activity-cache

Caches my recent activity (last 30 days) in SQLite and serves it over HTTP to the site's feed data layer.

```sh
pnpm dev     # http://localhost:3001
pnpm test
```

| env                | default                            |
| ------------------ | ---------------------------------- |
| `PORT`             | `3001`                             |
| `DATABASE_PATH`    | `data/activity.db`                 |
| `ATPROTO_DID`      | `did:plc:2xau7wbgdq4phuou2ypwuen7` |
| `REBUILD_INTERVAL` | `15 minutes`                       |

## API

- `GET /activity?limit=50&before=<cursor>&type=<type>&type=…`: newest first, `{ items, cursor }`. `503` until the first build finishes.
- `GET /status`: which generation is live and whether one is building. Unauthenticated, for health checks.

`src/api.ts` is the `HttpApi` definition, so a typed client can be generated from it.

### Auth

`/activity` requires `Authorization: Bearer <token>`. The token must be an [RFC 9068](https://www.rfc-editor.org/rfc/rfc9068.html) JWT access token (`typ: at+jwt`) from the site's OpenID provider, so there's no long-lived shared secret.

`src/oidc/OidcVerifier.ts` is an Effect wrapper around [openid-client](https://github.com/panva/openid-client) and `validateJwtAccessToken` from [oauth4webapi](https://github.com/panva/oauth4webapi), the library openid-client is built on.

- **Discovery** fetches `OIDC_ISSUER`'s `/.well-known/openid-configuration` and rejects it unless its `issuer` is exactly `OIDC_ISSUER`, with no trailing-slash normalisation. It runs on the first request, so the cache can start while the site is down.
- **Discovery caching:** concurrent requests share one attempt, and the metadata is refreshed hourly. A failure is remembered for 5 seconds, so an outage doesn't cause a discovery request per API request. If an hourly refresh fails, the last good metadata keeps being used until a retry succeeds.
- **Verification** checks the signature against the issuer's JWKS (cached, and refetched when keys rotate), plus `typ`, `iss`, `exp`, and that `aud` contains `OIDC_AUDIENCE`.
- **Failures:** a bad or missing token returns `401`. An unreachable or misconfigured issuer, including a key endpoint that errors, returns `503`.
- **Moved key endpoint:** if the keys can't be fetched, the next request rediscovers, at most once per 5 seconds, so a moved `jwks_uri` is picked up without waiting for the hourly refresh.
- **Key rotation:** keys are cached for 5 minutes. A token signed with a key that isn't cached triggers a refetch, but only if the cached key set is at least 60 seconds old; this is built into oauth4webapi. So when rotating:
  - publish the new key at least 5 minutes before signing with it, or tokens may get `401`s for up to a minute;
  - keep the old key published until tokens signed with it have expired;
  - a removed key is still trusted for up to 5 minutes.
- **Transport:** all HTTP goes through Effect's `HttpClient`.
- **Local dev:** `http://` issuers are only allowed on localhost, e.g. `next dev`.

## Data

One table per generation: `id` (at-uri for atproto), `timestamp` (epoch ms), `type` (e.g. the NSID) and `data` (JSON). `id` exists so realtime updates and deletes can find their row.

The data is disposable. Every rebuild starts from scratch:

1. Create a new generation table. Reads and realtime writes keep going to the live one.
2. Start buffering realtime mutations for the new generation, **before** asking any source for a snapshot.
3. Write each source's backfill into the new table.
4. Replay the buffer on top, mark the new generation active, and drop the old one.

Every change ends up in the snapshot, the buffer, or both. Replaying upserts and deletes in order is idempotent, so being in both is fine. A failed or interrupted rebuild drops its table and leaves the live generation alone.

Rebuilds run on boot and every `REBUILD_INTERVAL`, so data shape changes need no migrations or version bumps.

## Adding a data type

atproto collection: install the lexicon in `packages/atproto-client` (`pnpm lex:install <nsid> && pnpm build`), then add a `recordCollection(...)` to `src/sources/atproto/collections.ts`. Other sources implement `Source` (`src/Source.ts`) and get added in `main.ts`.

Realtime sources call `ActivityCache.apply` with mutations. For atproto, that's `CollectionHandler.toActivity`, the same mapping backfill uses.
