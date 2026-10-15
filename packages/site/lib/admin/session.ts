import "server-only";
import { Client, XrpcResponseError } from "@atproto/lex";
import { com } from "@repo/atproto-client";
import { base64url, decodeJwt, EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { resolvePds } from "../data/atproto";
import { DID } from "../data/profile";
import { env } from "../env";

/**
 * The CMS's login: an app password for my account, kept in an encrypted,
 * HTTP-only cookie along with the session it was exchanged for. Only my DID
 * can log in, so the password is all the login form asks for.
 *
 * Reading needs no login: everything the CMS edits is in my public repo.
 * Writes go through {@link repoClient}, which renews the session when it
 * expires, falling back to the app password once the refresh token has.
 */
interface Session {
  did: string;
  handle: string;
  /** My PDS, where the session is good. */
  pds: string;
  appPassword: string;
  accessJwt: string;
  refreshJwt: string;
}

const COOKIE = "cms_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/** A login that failed for a reason worth showing on the form. */
export class LoginError extends Error {}

/** Exchanges an app password for a session, and saves it in the cookie. */
export async function logIn(appPassword: string): Promise<void> {
  const pds = await resolvePds(DID);
  const tokens = await createSession(pds, appPassword).catch(
    (error: unknown) => {
      if (error instanceof XrpcResponseError) {
        if (error.status === 401) {
          throw new LoginError("That app password didn't work.");
        }
        if (error.status === 429) {
          throw new LoginError("Too many attempts. Try again later.");
        }
      }
      throw error;
    },
  );
  // The token's scope is the only way to tell an app password apart.
  if (decodeJwt(tokens.accessJwt).scope === "com.atproto.access") {
    throw new LoginError(
      "That's the account's password. Make an app password instead.",
    );
  }
  await saveSession({ pds, appPassword, ...tokens });
}

export async function logOut(): Promise<void> {
  (await cookies()).delete({ name: COOKIE, path: "/admin" });
}

/** The session, or `null` when logged out or the cookie can't be read. */
export const getSession = cache(async (): Promise<Session | null> => {
  const cookie = (await cookies()).get(COOKIE)?.value;
  if (!cookie) return null;
  try {
    const { payload } = await jwtDecrypt<{ session: Session }>(
      cookie,
      await sessionKey(),
    );
    return payload.session.did === DID ? payload.session : null;
  } catch {
    return null;
  }
});

/** The session, or else off to log in. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  return session;
}

/**
 * A client that writes to my repo as me. Only for Server Actions: when the
 * session has expired, it's renewed and saved to the cookie, which can't be
 * done while rendering. Requests are retried with the renewed session, so
 * their bodies can't be streams.
 */
export async function repoClient(): Promise<Client> {
  let session = await requireSession();
  const send = (path: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${session.accessJwt}`);
    return fetch(new URL(path, session.pds), { ...init, headers });
  };
  return new Client({
    did: DID,
    fetchHandler: async (path, init) => {
      const response = await send(path, init);
      if (!(await isExpired(response))) return response;
      session = { ...session, ...(await renew(session)) };
      await saveSession(session);
      return send(path, init);
    },
  });
}

async function isExpired(response: Response) {
  if (response.status !== 400 && response.status !== 401) return false;
  const body = (await response
    .clone()
    .json()
    .catch(() => null)) as { error?: unknown } | null;
  return body?.error === "ExpiredToken";
}

/**
 * New tokens: refreshed, or once the refresh token has expired too, a new
 * session from the app password. If that's been revoked, the cookie is
 * deleted, so the next page sends me to log in again.
 */
async function renew(session: Session) {
  const refreshed = await new Client({
    service: session.pds,
    headers: { authorization: `Bearer ${session.refreshJwt}` },
  })
    .call(com.atproto.server.refreshSession)
    .catch(() => null);
  if (refreshed) return refreshed;
  return createSession(session.pds, session.appPassword).catch(
    async (error: unknown) => {
      if (error instanceof XrpcResponseError && error.status === 401) {
        await logOut();
      }
      throw error;
    },
  );
}

async function createSession(pds: string, appPassword: string) {
  const { did, handle, accessJwt, refreshJwt } = await new Client(pds).call(
    com.atproto.server.createSession,
    { identifier: DID, password: appPassword },
  );
  if (did !== DID) throw new Error(`Logged in as ${did}, not ${DID}`);
  return { did, handle, accessJwt, refreshJwt };
}

async function saveSession(session: Session) {
  const jwe = await new EncryptJWT({ session })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .encrypt(await sessionKey());
  (await cookies()).set(COOKIE, jwe, {
    httpOnly: true,
    secure: env("NODE_ENV") !== "development",
    sameSite: "lax",
    // Server Actions post to the page they're on, so it's only needed here.
    path: "/admin",
    maxAge: MAX_AGE_SECONDS,
  });
}

/**
 * `CMS_SESSION_KEY`: 32 random bytes, base64url-encoded. In development,
 * when it's unset, a key is generated per `next dev` process, so sessions
 * end when it restarts.
 */
async function sessionKey(): Promise<Uint8Array> {
  const configured = env("CMS_SESSION_KEY");
  if (configured) {
    const key = base64url.decode(configured);
    if (key.length !== 32) {
      throw new Error("CMS_SESSION_KEY must be 32 bytes, base64url-encoded");
    }
    return key;
  }
  if (env("NODE_ENV") !== "development") {
    throw new Error(
      "CMS_SESSION_KEY is not set. Generate one with `pnpm --filter site generate-session-key`.",
    );
  }
  // On globalThis so every module instance in the dev server shares one key.
  const devKey = globalThis as { __cmsDevKey?: Uint8Array };
  devKey.__cmsDevKey ??= crypto.getRandomValues(new Uint8Array(32));
  return devKey.__cmsDevKey;
}
