import "server-only";
import {
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  importJWK,
  SignJWT,
  type JWK,
} from "jose";
import { env, required } from "./env";

/**
 * The site is an OpenID provider for its own backend services: it signs
 * RFC 9068 JWT access tokens, and services discover its keys from
 * `/.well-known/openid-configuration`. Nothing is issued to users; the only
 * client is the site itself.
 */

/**
 * Issuer identifier. Services require the discovered metadata to match it
 * exactly, so it has no trailing slash. `next dev` sets `PORT` to the port it
 * bound; on Vercel it's the production domain, in previews too.
 */
export const issuer = () => {
  if (env("NODE_ENV") === "development") {
    return `http://localhost:${env("PORT") ?? 3000}`;
  }
  return `https://${required("VERCEL_PROJECT_PRODUCTION_URL")}`;
};

/** The site, as both the token's subject and the client it was issued to. */
const CLIENT_ID = "site";
const TOKEN_LIFETIME_SECONDS = 5 * 60;

interface SigningKey {
  kid: string;
  alg: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
}

/**
 * `OIDC_SIGNING_KEYS` is a JSON array of private JWKs. The first signs; all of
 * them are published. To rotate, add the new key second, wait for services'
 * key caches to expire (5 minutes for the activity cache), move it first, then
 * drop the old one once tokens signed with it have expired.
 *
 * In development, when it's unset, a key is generated per `next dev` process.
 */
const loadKeys = async (): Promise<SigningKey[]> => {
  const configured = env("OIDC_SIGNING_KEYS");
  if (configured) {
    const jwks = JSON.parse(configured) as JWK[];
    if (!Array.isArray(jwks) || jwks.length === 0) {
      throw new Error(
        "OIDC_SIGNING_KEYS must be a non-empty JSON array of JWKs",
      );
    }
    return Promise.all(jwks.map(fromPrivateJwk));
  }
  if (env("NODE_ENV") !== "development") {
    throw new Error(
      "OIDC_SIGNING_KEYS is not set. Generate one with `pnpm --filter site generate-signing-key`.",
    );
  }
  // On globalThis so every module instance in the dev server shares one key.
  const devKey = globalThis as { __oidcDevKey?: Promise<SigningKey> };
  devKey.__oidcDevKey ??= generateKeyPair("ES256", { extractable: true })
    .then(({ privateKey }) => exportJWK(privateKey))
    .then((jwk) => fromPrivateJwk({ ...jwk, alg: "ES256" }));
  return [await devKey.__oidcDevKey];
};

const fromPrivateJwk = async (jwk: JWK): Promise<SigningKey> => {
  const alg = jwk.alg ?? "ES256";
  const kid = jwk.kid ?? (await calculateJwkThumbprint(jwk));
  const privateKey = await importJWK(jwk, alg);
  if (privateKey instanceof Uint8Array || privateKey.type !== "private") {
    throw new Error(`Signing key ${kid} is not an asymmetric private key`);
  }
  // Copy only public members, so nothing private can end up in the JWKS.
  const publicJwk: JWK = { kid, alg, use: "sig" };
  for (const member of PUBLIC_MEMBERS) {
    if (jwk[member] !== undefined) publicJwk[member] = jwk[member];
  }
  return { kid, alg, privateKey, publicJwk };
};

/** The public members of EC, OKP, and RSA keys. */
const PUBLIC_MEMBERS = ["kty", "crv", "x", "y", "n", "e"] as const;

let keys: Promise<SigningKey[]> | undefined;
const signingKeys = () => {
  keys ??= loadKeys().catch((error) => {
    keys = undefined;
    throw error;
  });
  return keys;
};

/** The public half of every signing key, served as the issuer's JWKS. */
export const publicJwks = async () => ({
  keys: (await signingKeys()).map((key) => key.publicJwk),
});

/** A short-lived access token for calling `audience` as the site. */
export const accessToken = async (audience: string) => {
  const [key] = await signingKeys();
  return new SignJWT({ client_id: CLIENT_ID })
    .setProtectedHeader({ alg: key.alg, typ: "at+jwt", kid: key.kid })
    .setIssuer(issuer())
    .setSubject(CLIENT_ID)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_LIFETIME_SECONDS}s`)
    .setJti(crypto.randomUUID())
    .sign(key.privateKey);
};
