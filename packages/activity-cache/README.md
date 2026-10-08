# @repo/activity-cache

Caches my recent activity (last 30 days) in SQLite and serves it over HTTP to the site's feed data layer.

```sh
pnpm dev     # http://localhost:3001
pnpm test
```

Configuration comes from environment variables, then `.env` (gitignored, for local overrides and secrets). Under `pnpm dev`, the committed [`.env.development`](.env.development) fills in the rest: it points `OIDC_ISSUER` at the site's `next dev` server, so the service starts with no setup. `/activity` returns `503` until the site serves an OpenID provider.

| env             | default                                  |
| --------------- | ---------------------------------------- |
| `PORT`          | `3001`                                   |
| `DATABASE_PATH` | `data/activity.db`                       |
| `ATPROTO_DID`   | `did:plc:2xau7wbgdq4phuou2ypwuen7`       |
| `JETSTREAM_URL` | `https://jetstream.us-east.bsky.network` |
| `GITHUB_USER`   | `tom-sherman`                            |
| `GITHUB_TOKEN`  | optional; see [GitHub](#github)          |
| `OIDC_ISSUER`   | required (dev: `http://localhost:3000`)  |
| `OIDC_AUDIENCE` | required (dev: `activity-cache`)         |

## API

- `GET /activity?limit=50&before=<cursor>&type=<type>&type=…`: newest first, `{ items, cursor }`, with [roll-ups](#roll-ups) in place of what they roll up. `type` matches the roll-up, not its members. `503` until the first build finishes.
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

- `activity`: `source`, `id` (at-uri for atproto, `github:<event id>` for GitHub), `timestamp` (epoch ms), `type` (e.g. the NSID) and `data` (JSON), plus `group_id` and `collects` for [roll-ups](#roll-ups). `source` and `id` let a source's rows be replaced, and realtime updates and deletes find their row.
- `source_state`: one row per source with its fingerprint, last refresh, checkpoint, stream cursor and backoff. It's what lets a restart pick up where the last process left off.

The data is disposable, but the store is durable: a restart serves what's there and doesn't call upstream until something is due.

### Refreshing

Each source (`src/Source.ts`) refreshes independently, so one being down or rate limited doesn't hold up the others:

- **Fingerprint.** Each source describes what it stores; for atproto that's the DID plus each collection and its mapper version. If it doesn't match the stored rows, the source is rebuilt on boot.
- **Refresh timing.** Each result says when to ask again (`refreshAfter`): a constant for atproto, GitHub's `X-Poll-Interval` for GitHub. The cache stores it as an absolute time, so a restart doesn't move it.
- **Checkpoint.** A source can cheaply say nothing changed. For atproto it's the repo revision: a refresh costs one `getLatestCommit` call, and the export is only downloaded when the revision moved on. For GitHub it's the first page's ETag: a refresh is one conditional request, and a `304` means nothing changed. A realtime stream moves the checkpoint along with the rows, so checks stay cheap.
- **Backoff.** Every attempt is recorded before upstream is called: 30s, then doubling up to 1h. A process that crashes mid-refresh comes back to a backoff, not an immediate retry. If upstream says when to come back (`Retry-After` / `RateLimit-Reset`), that wins.

A refresh swaps the source's rows in one transaction, so reads see the old rows until it commits:

1. Start buffering the source's realtime mutations, **before** asking it for a snapshot. Realtime writes keep going to the table as well.
2. Fetch the snapshot. Rows and other sources keep serving meanwhile.
3. In one transaction: delete the source's rows (unless it's [append-only](#append-only-sources)), insert the snapshot, replay the buffer, update `source_state`.

Every change ends up in the snapshot, the buffer, or both. Replaying upserts and deletes in order is idempotent, so being in both is fine. A failed or interrupted refresh leaves the rows alone.

A table layout change (`SCHEMA_VERSION` in `src/Store.ts`) drops everything and lets sources refill.

### Append-only sources

Some upstreams never delete anything, but only serve their latest items: GitHub serves the last 30 days of events, but at most 300. A source that sets `appendOnly` has its snapshots merged into its rows instead of replacing them, so what drops out of upstream's window stays until it's older than the retention window. A rebuild (fingerprint change) still replaces them, since the old rows were built with the old mapping; anything upstream no longer serves is lost then.

### Realtime

A source can also offer a stream of changes (`Source.changes`), which the cache follows for as long as it runs. The source turns upstream events into changes, and the cache does the writing, so the two can't drift apart:

- **Batch:** mutations (possibly none), the stream's cursor, and optionally the checkpoint they bring the rows up to. All of it is written in one transaction, so a restart resumes right after the last change written.
- **Gap:** changes may have been missed. The rows are marked stale (fingerprint and checkpoint cleared), so the next refresh is a rebuild, and it happens now rather than when it's next due (backoff still applies). If a gap happens while a refresh is in flight, its snapshot may predate what was missed: it's swapped in, but the source stays stale and rebuilds again.
- A stream opened without a cursor starts with a gap: whatever happened before it is only in the next snapshot.
- When the stream fails, it's reopened from the last cursor, backing off like refreshes do (30s, doubling up to 1h) until it delivers again.

For atproto that's [Jetstream](https://github.com/bluesky-social/jetstream) (v2, via `@bsky/jetstream`, wrapped as an Effect service in `src/jetstream/Jetstream.ts`), filtered to the DID. Commits are mapped by the same `CollectionHandler`s snapshots use, and every commit moves the checkpoint to its `rev`, including commits to collections that aren't cached. A seq cursor older than Jetstream keeps (about a day and a half), a clamped timestamp cursor, or a `#sync` (the repo was reset) is a gap. Starting over uses a timestamp cursor from a minute before now, to allow for clock skew.

Resuming makes Jetstream scan everything since the cursor for the DID's events, at very roughly an hour of firehose a minute, so a restart after a long outage takes a while to catch up. The SDK's idle timeout is off: a stream filtered to one account goes quiet for hours, and redialling every minute would restart that scan every time. Node's WebSocket pings already detect dead connections.

### Roll-ups

Some activity is better shown as one item, like a Bluesky thread I want to call out as writing. A source can say so per record, so snapshots and realtime writes need nothing extra:

- `group`: the group an activity belongs to, keyed by the id of the group's first activity. Each post's group is its thread's root post, and a top-level post is the root of its own thread. Like Bluesky's author threads, a reply only counts when its root and parent are both mine, so replies to other people stay separate.
- `collects`: rolls a group up. An `is.sherman.unspecced.thread` record collects the thread its `subject` starts.

Roll-ups happen when reading, so a record can arrive before or after the posts it collects. The roll-up takes the place and timestamp of the group's first activity, and the group's activities are in its `members`, oldest first, not in the feed. Until that first activity is cached (or once it's deleted or pruned), the roll-up is hidden and the group shows as usual. Roll-ups only collect within their own source. If two records collect the same group, the lowest id wins.

### GitHub

`src/sources/github/GitHubEvents.ts` caches my public events (`GET /users/{GITHUB_USER}/events/public`): pushes, PRs, stars and so on. Only public ones, even if the token can see more. `type` is `github.` plus the event type, e.g. `github.PushEvent`, and `data` is the event as GitHub serves it.

- **Paging.** 100 events a page, following `Link: rel="next"` until an event is older than the retention window. GitHub only serves the last 30 days of events, and at most 300 of them, so the source is [append-only](#append-only-sources): in a month with more than 300, the older ones drop out early and are kept until they're 30 days old. Otherwise GitHub's window and the retention window line up, so a rebuild usually loses nothing. Events that shift onto the next page while paging are deduplicated.
- **Token.** `GITHUB_TOKEN` is optional; any token works, it needs no scopes. Without one, GitHub allows 60 requests an hour per IP and even a `304` counts, so the source polls at most every 5 minutes instead of at `X-Poll-Interval` (usually 60s). With one, `304`s are free.
- **Latency.** GitHub says events can take anywhere from 30s to 6h to show up, so a fresh push won't always be in the feed straight away.
- **Rate limits.** A `403`/`429` with `Retry-After`, or with `X-RateLimit-Remaining: 0` and `X-RateLimit-Reset`, becomes the source's next attempt time.

## Adding a data type

**atproto collection.** Install the lexicon in `packages/atproto-client` (`pnpm lex:install <nsid> && pnpm build`), then add a `recordCollection(...)` to `src/sources/atproto/collections.ts`. Its `rollup` option sets `group` and `collects`. That changes the fingerprint, so the atproto rows are rebuilt on the next boot. Changing how an existing collection maps? Bump its `version`.

**Another source** (like GitHub): implement `Source` with a `name`, a `fingerprint` and `snapshot({ since, checkpoint })` returning a `SnapshotResult` with its `refreshAfter`, and add it in `main.ts`. Set `appendOnly` if upstream never deletes but stops serving older items. Fail with a `SourceError` carrying `retryAt` when upstream rate limits. For realtime, add `changes({ cursor })` returning a stream of [changes](#realtime), mapped the same way snapshots are.
