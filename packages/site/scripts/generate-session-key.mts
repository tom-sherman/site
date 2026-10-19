// Prints a new key for CMS_SESSION_KEY. See README.md.
import { base64url } from "jose";

console.log(base64url.encode(crypto.getRandomValues(new Uint8Array(32))));
