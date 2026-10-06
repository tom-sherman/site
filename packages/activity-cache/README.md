# @repo/activity-cache

Caches my recent activity (last 30 days) in SQLite and serves it over HTTP to the site's feed data layer.

```sh
pnpm dev     # http://localhost:3001
pnpm test
```

Configuration comes from environment variables, then `.env` (gitignored, for local overrides and secrets). Under `pnpm dev`, the committed [`.env.development`](.env.development) fills in the rest: it points `OIDC_ISSUER` at the site's `next dev` server, so the service starts with no setup. `/activity` returns `503` until the site serves an OpenID provider.

| env             | default                                 |
| --------------- | --------------------------------------- |
| `PORT`          | `3001`                                  |
| `DATABASE_PATH` | `data/activity.db`                      |
| `ATPROTO_DID`   | `did:plc:2xau7wbgdq4phuou2ypwuen7`      |
| `OIDC_ISSUER`   | required (dev: `http://localhost:3000`) |
| `OIDC_AUDIENCE` | required (dev: `activity-cache`)        |

## API

- `GET /activity?limit=50&before=<cursor>&type=<type>&type=…`: newest first, `{ items, cursor }`. `503` until the first build finishes.
- `GET /status`: per source, whether its rows match the current fingerprint, when it last refreshed, and any backoff. Unauthenticated, for health checks.

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

Two tables:

- `activity`: `source`, `id` (at-uri for atproto), `timestamp` (epoch ms), `type` (e.g. the NSID) and `data` (JSON). `source` and `id` let a source's rows be replaced, and realtime updates and deletes find their row.
- `source_state`: one row per source with its fingerprint, last refresh, checkpoint and backoff. It's what lets a restart pick up where the last process left off.

The data is disposable, but the store is durable: a restart serves what's there and doesn't call upstream until something is due.

### Refreshing

Each source (`src/Source.ts`) refreshes independently, so one being down or rate limited doesn't hold up the others:

- **Fingerprint.** Each source describes what it stores; for atproto that's the DID plus each collection and its mapper version. If it doesn't match the stored rows, the source is rebuilt on boot.
- **Refresh timing.** Each result says when to ask again (`refreshAfter`): a constant for atproto, GitHub's `X-Poll-Interval` for GitHub. The cache stores it as an absolute time, so a restart doesn't move it.
- **Checkpoint.** A source can cheaply say nothing changed. For atproto it's the repo revision: a refresh costs one `getLatestCommit` call, and the export is only downloaded when the revision moved on.
- **Backoff.** Every attempt is recorded before upstream is called: 30s, then doubling up to 1h. A process that crashes mid-refresh comes back to a backoff, not an immediate retry. If upstream says when to come back (`Retry-After` / `RateLimit-Reset`), that wins.

A refresh swaps the source's rows in one transaction, so reads see the old rows until it commits:

1. Start buffering the source's realtime mutations, **before** asking it for a snapshot. Realtime writes keep going to the table as well.
2. Fetch the snapshot. Rows and other sources keep serving meanwhile.
3. In one transaction: delete the source's rows, insert the snapshot, replay the buffer, update `source_state`.

Every change ends up in the snapshot, the buffer, or both. Replaying upserts and deletes in order is idempotent, so being in both is fine. A failed or interrupted refresh leaves the rows alone.

A table layout change (`SCHEMA_VERSION` in `src/Store.ts`) drops everything and lets sources refill.

## Adding a data type

**atproto collection.** Install the lexicon in `packages/atproto-client` (`pnpm lex:install <nsid> && pnpm build`), then add a `recordCollection(...)` to `src/sources/atproto/collections.ts`. That changes the fingerprint, so the atproto rows are rebuilt on the next boot. Changing how an existing collection maps? Bump its `version`.

**Another source** (e.g. GitHub): implement `Source` with a `name`, a `fingerprint` and `snapshot({ since, checkpoint })` returning a `SnapshotResult` with its `refreshAfter`, and add it in `main.ts`. Fail with a `SourceError` carrying `retryAt` when upstream rate limits.

Realtime sources call `ActivityCache.apply(source, mutations)`. For atproto that should go through `CollectionHandler.toActivity`, the same mapping snapshots use.
