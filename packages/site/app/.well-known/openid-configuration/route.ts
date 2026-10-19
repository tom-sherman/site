import { issuer } from "@/lib/oidc";

/**
 * OpenID discovery, so services that accept the site's access tokens can find
 * its keys. Only what's needed to verify tokens: the site has no
 * authorization or token endpoint, because it only issues tokens to itself.
 */
export function GET() {
  const iss = issuer();
  return Response.json({
    issuer: iss,
    jwks_uri: `${iss}/.well-known/jwks.json`,
  });
}
