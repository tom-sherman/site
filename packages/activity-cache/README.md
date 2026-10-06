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
- `GET /status`: which generation is live and whether one is building.

`src/api.ts` is the `HttpApi` definition, so a typed client can be generated from it.

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
