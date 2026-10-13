# @repo/activity-cache

Caches my recent activity (last 30 days) in SQLite and serves it over HTTP to the site's feed data layer.

```sh
pnpm dev     # http://localhost:3001
pnpm test
```

Configuration comes from environment variables, then `.env` (gitignored, for local overrides and secrets). Under `pnpm dev`, the committed [`.env.development`](.env.development) fills in the rest: it points `OIDC_ISSUER` at the site's `next dev` server, so the service starts with no setup. Run the site's `pnpm dev` too: `/activity` returns `503` while it's down, since the cache can't discover the site's keys.

| env               | default                                  |
| ----------------- | ---------------------------------------- |
| `PORT`            | `3001`                                   |
| `DATABASE_PATH`   | `data/activity.db`                       |
| `ATPROTO_DID`     | `did:plc:2xau7wbgdq4phuou2ypwuen7`       |
| `JETSTREAM_URL`   | `https://jetstream.us-east.bsky.network` |
| `GITHUB_USER`     | `tom-sherman`                            |
| `GITHUB_TOKEN`    | optional; see [GitHub](#github)          |
| `LETTERBOXD_USER` | `tomus`                                  |
| `OIDC_ISSUER`     | required (dev: `http://localhost:3000`)  |
| `OIDC_AUDIENCE`   | required (dev: `activity-cache`)         |

## API

- `GET /activity?limit=50&before=<cursor>&type=<type>&type=…`: newest first, `{ items, cursor }`, with [roll-ups](#roll-ups) in place of what they roll up. `type` matches the roll-up, not its members. `503` until the first build finishes.
- `GET /status`: per source, whether its rows match the current fingerprint, when it last refreshed, and any backoff. Unauthenticated, for health checks.

Each item is one member of the `ActivityItem` union in `src/ActivityItem.ts`, keyed by `type`, so `data` is typed per type:

- **atproto records** (`app.bsky.feed.post`, `app.bsky.feed.like`, `app.bsky.feed.repost`, `app.bsky.graph.follow`, `fm.teal.feed.play`, `is.sherman.unspecced.thread`): `data` is the record, through `lexRecord` from `@repo/atproto-client/effect`. On the wire it's lexicon JSON (`$link`s, blobs as `{ $type: "blob" }`). Decoded, it's lex's own values (`Cid`s, `BlobRef`s), validated against the lexicon. A thread has its posts in `members`, which is never empty.
- **GitHub events** (`github.PushEvent`, …): `data` is `{ actor, repo, payload }`, with only the payload fields the schema lists.
- **Letterboxd diary entries** (`letterboxd.rating`, `letterboxd.review`): `data` is the entry's `url`, its `film` (title, year, poster, TMDB id), `watchedDate`, `rewatch`, `liked` and `rating`, plus for a review its text (`review`) and whether it's marked as having `spoilers`.

`type` filters only accept these types. Stored rows are decoded into the union when they're served. One that doesn't decode is logged and left out, and the cursor still moves past it.

`src/api.ts` is the `HttpApi` definition: endpoints and schemas, no handlers. It's exported as `@repo/activity-cache/api`, and the site builds its client from it with `HttpApiClient`, so it must only import `effect` and other client-safe modules.

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

- `activity`: `source`, `id` (at-uri for atproto, `github:<event id>` for GitHub, `letterboxd:<kind>-<id>` for Letterboxd), `timestamp` (epoch ms), `type` (e.g. the NSID) and `data` (JSON), plus `group_id` and `collects` for [roll-ups](#roll-ups). `source` and `id` let a source's rows be replaced, and realtime updates and deletes find their row.
- `source_state`: one row per source with its fingerprint, last refresh, checkpoint, realtime cursor and backoff. It's what lets a restart pick up where the last process left off.

The data is disposable, but the store is durable: a restart serves what's there and doesn't call upstream until something is due.

### What's durable

Only atproto. My repo is the one upstream that's durable, open and complete: a rebuild downloads all of it, so its rows can always be rebuilt in full, however the mapping or the retention window changes. Every other source only serves a recent window (GitHub's last 30 days, Letterboxd's last 50 diary entries), so whatever falls out of it is gone for good the next time the source is rebuilt or the table layout changes. That's accepted: their rows are disposable, and the cache doesn't try to make them anything more (no archive, no keeping rows across rebuilds).

Anything I want a longer history of belongs in my atproto repo, as records, rather than in the cache. Then a longer retention window is just a wider filter on the export.

### Refreshing

Each source (`src/Source.ts`) refreshes independently, so one being down or rate limited doesn't hold up the others:

- **Fingerprint.** Each source describes what it stores; for atproto that's the DID plus each collection and its mapper version. If it doesn't match the stored rows, the source is rebuilt on boot.
- **Refresh timing.** Each result says when to ask again (`refreshAfter`): a constant for atproto, GitHub's `X-Poll-Interval` for GitHub. The cache stores it as an absolute time, so a restart doesn't move it.
- **Checkpoint.** A source can cheaply say nothing changed. For atproto it's the repo revision: a refresh costs one `getLatestCommit` call, and the export is only downloaded when the revision moved on. For GitHub it's the first page's ETag: a refresh is one conditional request, and a `304` means nothing changed. A realtime stream moves the checkpoint along with the rows, so checks stay cheap.
- **Backoff.** Every attempt is recorded before upstream is called: 30s, then doubling up to 1h. A process that crashes mid-refresh comes back to a backoff, not an immediate retry. If upstream says when to come back (`Retry-After` / `RateLimit-Reset`), that wins.

A refresh swaps the source's rows in one transaction, so reads see the old rows until it commits:

1. Start buffering the source's realtime mutations, **before** asking it for a snapshot. Realtime writes keep going to the table as well.
2. Fetch the snapshot. Rows and other sources keep serving meanwhile.
3. In one transaction: delete the source's rows (only back to where it's complete, for a [partial snapshot](#partial-snapshots)), insert the snapshot, replay the buffer, update `source_state`.

Every change ends up in the snapshot, the buffer, or both. Replaying upserts and deletes in order is idempotent, so being in both is fine. A failed or interrupted refresh leaves the rows alone.

A table layout change (`SCHEMA_VERSION` in `src/Store.ts`) drops everything and lets sources refill.

### Partial snapshots

Some upstreams only serve their latest items: GitHub serves the last 30 days of events, but at most 300, and Letterboxd's feed is my last 50 diary entries. In a busy month, items drop out of upstream's window while they're still in the retention window. So a snapshot can say how far back it's complete (`completeAfter`, usually its oldest item): it has everything newer than that, so stored rows from then on that it's missing are gone upstream and are deleted, and older ones are kept until they're older than the retention window. A snapshot with nothing in it is complete after now, so it keeps everything.

A rebuild (fingerprint change) still replaces every row, since the old rows were built with the old mapping; anything upstream no longer serves is lost then. That's [by design](#whats-durable).

### Realtime

A source can also follow upstream in realtime (`Source.follow`), which the cache runs for as long as it runs. The source turns upstream events into changes and hands each to an `apply` function from the cache, which does the writing, so the two can't drift apart:

- **Batch:** mutations (possibly none), and optionally the checkpoint they bring the rows up to, written in one transaction.
- **Gap:** changes may have been missed. The rows are marked stale (fingerprint and checkpoint cleared), so the next refresh is a rebuild, and it happens now rather than when it's next due (backoff still applies). If a gap happens while a refresh is in flight, its snapshot may predate what was missed: it's swapped in, but the source stays stale and rebuilds again.

Where the source is upstream is its own business: it loads and saves its cursor through a `CursorStore` the cache provides (stored in `source_state`, opaque to the cache). The rule is the one `PersistedQueue` and the Jetstream SDK's runner follow: save a cursor only after `apply` succeeds for everything before it. A crash in between replays changes, which is harmless because they're idempotent; saving first could skip them. Likewise, a source with no usable cursor applies a gap before saving where it starts from: whatever happened before then is only in the next snapshot.

When `follow` fails, the cache runs it again, backing off like refreshes do (30s, doubling up to 1h) until it applies something again.

For atproto that's [Jetstream](https://github.com/bluesky-social/jetstream) (v2, via `@bsky/jetstream`, wrapped as an Effect service in `src/jetstream/Jetstream.ts`), filtered to the DID. Commits are mapped by the same `CollectionHandler`s snapshots use, and every commit moves the checkpoint to its `rev`, including commits to collections that aren't cached. A seq cursor older than Jetstream keeps (about a day and a half), a clamped timestamp cursor, or a `#sync` (the repo was reset) is a gap. Starting over uses a timestamp cursor from a minute before now, to allow for clock skew.

Resuming makes Jetstream scan everything since the cursor for the DID's events, at very roughly an hour of firehose a minute, so a restart after a long outage takes a while to catch up. The SDK's idle timeout is off: a stream filtered to one account goes quiet for hours, and redialling every minute would restart that scan every time. Node's WebSocket pings already detect dead connections.

**Why not Jetstream's archive?** Jetstream v2 also keeps an archive of the whole network, which `replay()` can backfill from, so after an outage the stream could catch up instead of the source rebuilding. But we only follow one repo, and it's simpler to download it and filter it:

- **Export:** one unauthenticated request to the PDS. It's the repo's exact current state, so deletes, edits and resets (`#sync`) are already accounted for, and taking the last 30 days is a filter.
- **Archive:** a history of events to fold into rows, which still can't explain a reset. It's addressed by seq rather than time, so "30 days ago" has no direct way in, and it needs an API token.

It's also more to download. Measured in October 2026: the export was 5.8MB in one request (about half a second), while 30 days from the archive was 55–60MB over about 140 requests (13–25s) for about 130 events. The archive plans downloads per DID, but in blocks of everyone's events, about 0.4MB each, and filters client-side. So its cost tracks how much I posted in the window, while the export's tracks the size of the whole repo. Worth revisiting if the repo grows to hundreds of MBs and the export gets slow.

### Roll-ups

Some activity is better shown as one item, like a Bluesky thread I want to call out as writing. A source can say so per record, so snapshots and realtime writes need nothing extra:

- `group`: the group an activity belongs to, keyed by the id of the group's first activity. Each post's group is its thread's root post, and a top-level post is the root of its own thread. Like Bluesky's author threads, a reply only counts when its root and parent are both mine, so replies to other people stay separate.
- `collects`: rolls a group up. An `is.sherman.unspecced.thread` record collects the thread its `subject` starts.

Roll-ups happen when reading, so a record can arrive before or after the posts it collects. The roll-up takes the place and timestamp of the group's first activity, and the group's activities are in its `members`, oldest first, not in the feed. Until that first activity is cached (or once it's deleted or pruned), the roll-up is hidden and the group shows as usual. Roll-ups only collect within their own source. If two records collect the same group, the lowest id wins.

### GitHub

`src/sources/github/GitHubEvents.ts` caches my public events (`GET /users/{GITHUB_USER}/events/public`): pushes, PRs, stars and so on. Only public ones, even if the token can see more. `type` is `github.` plus the event type, e.g. `github.PushEvent`, and `data` is the event as GitHub serves it. Only types in `GitHubItem` (`src/ActivityItem.ts`) are kept, and only when they match its schema; an event of a known type that doesn't is logged. GitHub trims event payloads: pull requests have no title, and pushes no commits.

- **Paging.** 100 events a page, following `Link: rel="next"` until an event is older than the retention window. GitHub only serves the last 30 days of events, and at most 300 of them, so snapshots are [partial](#partial-snapshots), complete back to the oldest event fetched: in a month with more than 300, the older ones drop out early and are kept until they're 30 days old, while events GitHub stops serving within its window (say, from a repo made private) are removed. Otherwise GitHub's window and the retention window line up, so a rebuild usually loses nothing. Events that shift onto the next page while paging are deduplicated.
- **Token.** `GITHUB_TOKEN` is optional; any token works, it needs no scopes. Without one, GitHub allows 60 requests an hour per IP and even a `304` counts, so the source polls at most every 5 minutes instead of at `X-Poll-Interval` (usually 60s). With one, `304`s are free.
- **Latency.** GitHub says events can take anywhere from 30s to 6h to show up, so a fresh push won't always be in the feed straight away.
- **Rate limits.** A `403`/`429` with `Retry-After`, or with `X-RateLimit-Remaining: 0` and `X-RateLimit-Reset`, becomes the source's next attempt time.

### Letterboxd

`src/sources/letterboxd/LetterboxdDiary.ts` caches my diary from the RSS feed at `letterboxd.com/{LETTERBOXD_USER}/rss/`, since Letterboxd's API is invite-only. The feed is my last 50 diary entries, newest logged first, then my lists, with Letterboxd's own elements (`letterboxd:memberRating`, `letterboxd:rewatch`, …) alongside RSS's. `fast-xml-parser` reads it into plain objects, and each item is decoded with an Effect Schema, so one that doesn't fit is logged and skipped rather than failing the refresh.

- **What's kept.** Reviews (guid `letterboxd-review-<id>`) become `letterboxd.review`, with or without a rating. Watches (`letterboxd-watch-<id>`) with a rating become `letterboxd.rating`; ones logged without a rating are left out. Lists are left out for now.
- **Reviews.** The `description` is HTML: the poster, then the review's paragraphs (or "Watched on …" for a watch). `htmlparser2` turns the paragraphs into plain text, with `<br>`s as newlines and paragraphs separated by blank lines. A leading "This review may contain spoilers." becomes `spoilers: true`.
- **Timestamps.** An entry's `timestamp` is its `pubDate`, when it was logged; `watchedDate` is the day it was watched, with no time.
- **[Partial snapshots](#partial-snapshots).** Each snapshot is complete back to the oldest diary entry in the feed: rows from then on are replaced, which picks up deleted and edited entries, and older ones are kept, so a month with more than 50 entries doesn't lose any. An empty diary keeps everything, so a feed that comes back empty by mistake doesn't wipe the rows.
- **Checkpoint.** The feed has no `ETag` or `Last-Modified`, so every refresh (every 10 minutes) downloads it, about 50KB. The checkpoint is a hash of it, so an unchanged feed doesn't rewrite the rows.
- **Rate limits.** The feed is behind Cloudflare. A `Retry-After` becomes the source's next attempt time. A challenge page isn't the feed, so it fails to parse and backs off.

## Adding a data type

**atproto collection.** Install the lexicon in `packages/atproto-client` (`pnpm lex:install <nsid> && pnpm build`), then add a `recordCollection(...)` to `src/sources/atproto/collections.ts`, and a `record(...)` item to `ActivityItem` in `src/ActivityItem.ts` so the API serves it. Its `rollup` option sets `group` and `collects`. That changes the fingerprint, so the atproto rows are rebuilt on the next boot. Changing how an existing collection maps? Bump its `version`.

**GitHub event type.** Add a `githubEvent(...)` to `GitHubItem` in `src/ActivityItem.ts`, with the payload fields to serve, and bump `VERSION` in `GitHubEvents.ts` so stored events are refetched.

**Another source** (like GitHub): implement `Source` with a `name`, a `fingerprint` and `snapshot({ since, checkpoint })` returning a `SnapshotResult` with its `refreshAfter`, add it in `main.ts`, and add its types to `ActivityItem`. If upstream only serves its latest items, return `completeAfter`. Fail with a `SourceError` carrying `retryAt` when upstream rate limits. For realtime, add `follow(apply)`, [applying changes](#realtime) mapped the same way snapshots are.
