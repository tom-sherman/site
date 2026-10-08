// Prints a new private signing key for OIDC_SIGNING_KEYS. See README.md.
import { calculateJwkThumbprint, exportJWK, generateKeyPair } from "jose";

const { privateKey } = await generateKeyPair("ES256", { extractable: true });
const jwk = { ...(await exportJWK(privateKey)), alg: "ES256" };
console.log(JSON.stringify({ ...jwk, kid: await calculateJwkThumbprint(jwk) }));
