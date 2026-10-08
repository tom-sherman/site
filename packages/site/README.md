# site

```sh
pnpm dev     # http://localhost:3000
```

Configuration comes from environment variables. Under `pnpm dev`, the committed [`.env.development`](.env.development) fills them in; override in `.env.local` (gitignored).

| env                       | default                                               |
| ------------------------- | ----------------------------------------------------- |
| `OIDC_ISSUER`             | required (dev: `http://localhost:3000`)               |
| `OIDC_SIGNING_KEYS`       | required for builds; see [Auth](#auth)                |
| `ACTIVITY_CACHE_URL`      | required (dev: `http://localhost:3001`)               |
| `ACTIVITY_CACHE_AUDIENCE` | required (dev: `activity-cache`), its `OIDC_AUDIENCE` |

## Auth

The site is an OpenID provider for its own backend services, like the [activity cache](../activity-cache#auth). It signs short-lived [RFC 9068](https://www.rfc-editor.org/rfc/rfc9068.html) JWT access tokens for itself (`sub` and `client_id` are `site`), and services verify them against keys they discover, so there's no shared secret.

- `/.well-known/openid-configuration` gives the `issuer` and `jwks_uri`. There's no authorization or token endpoint; tokens are only minted in-process, by `accessToken` in `lib/oidc.ts`.
- `/.well-known/jwks.json` publishes the public half of every signing key.
- Both are prerendered, so `OIDC_ISSUER` and `OIDC_SIGNING_KEYS` must be set when building, and changing them needs a rebuild.
- `OIDC_ISSUER` must match each service's configured issuer exactly, with no trailing slash.
- `lib/activity-cache.ts` is `fetch` against the activity cache with a fresh token.

### Signing keys

`OIDC_SIGNING_KEYS` is a JSON array of private JWKs: the first signs, and all are published. Generate one with:

```sh
pnpm generate-signing-key
```

In development, when it's unset, `next dev` generates a key on startup. After a restart, a service that fetched the old key in the last minute rejects tokens until it's allowed to refetch.

To rotate:

1. Add the new key second, so it's published but not used.
2. After services' key caches expire (5 minutes for the activity cache), move it first.
3. Once tokens signed with the old key have expired (5 minutes), remove it.
