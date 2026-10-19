# site

```sh
pnpm dev     # http://localhost:3000
```

Configuration comes from environment variables. Under `pnpm dev`, the committed [`.env.development`](.env.development) fills them in; override in `.env.local` (gitignored).

| env                       | default                                               |
| ------------------------- | ----------------------------------------------------- |
| `OIDC_SIGNING_KEYS`       | required for builds; see [Auth](#auth)                |
| `ACTIVITY_CACHE_URL`      | required (dev: `http://localhost:3001`)               |
| `ACTIVITY_CACHE_AUDIENCE` | required (dev: `activity-cache`), its `OIDC_AUDIENCE` |
| `CMS_SESSION_KEY`         | required for the CMS; see [CMS](#cms)                 |

## Auth

The site is an OpenID provider for its own backend services, like the [activity cache](../activity-cache#auth). It signs short-lived [RFC 9068](https://www.rfc-editor.org/rfc/rfc9068.html) JWT access tokens for itself (`sub` and `client_id` are `site`), and services verify them against keys they discover, so there's no shared secret.

- `/.well-known/openid-configuration` gives the `issuer` and `jwks_uri`. There's no authorization or token endpoint; tokens are only minted in-process, by `accessToken` in `lib/oidc.ts`.
- `/.well-known/jwks.json` publishes the public half of every signing key.
- The issuer is `http://localhost:$PORT` under `next dev`, and otherwise `https://$VERCEL_PROJECT_PRODUCTION_URL`, which Vercel sets in production and preview builds. It must match each service's `OIDC_ISSUER` exactly.
- Both are prerendered, so `OIDC_SIGNING_KEYS` must be set when building, and changing it or the production domain needs a rebuild.
- `activityCache` in `lib/activity-cache.ts` calls the activity cache with a fresh token, through an Effect `HttpApiClient` built from the cache's API definition, so responses are decoded against its schemas.

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

## CMS

`/admin` manages the site's content, which all lives in my atproto repo. Log in with an [app password](https://bsky.app/settings/app-passwords) for my account; only my DID (`DID` in `lib/data/profile.ts`) can log in, so there's no username.

- The app password is exchanged for a session on my PDS, and both are kept in an encrypted (JWE, `dir` + `A256GCM`), HTTP-only `cms_session` cookie on `/admin`, for 30 days.
- An account password is refused: only app passwords' tokens are scoped `com.atproto.appPass`.
- Pages read my public repo, so they don't use the session. Server Actions write through `repoClient` in `lib/admin/session.ts`, which checks the session first, and renews it when it's expired: with the refresh token, or once that's expired too, the app password. Revoking the app password logs the CMS out.

`CMS_SESSION_KEY` is the cookie's 32-byte key, base64url-encoded. Generate one with:

```sh
pnpm generate-session-key
```

Changing it logs the CMS out. In development, when it's unset, `next dev` generates one on startup, so restarting it logs out.
