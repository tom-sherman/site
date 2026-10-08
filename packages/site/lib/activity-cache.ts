import "server-only";
import { required } from "./env";
import { accessToken } from "./oidc";

/** `fetch` against the activity cache, authenticated with a fresh access token. */
export const activityCacheFetch = async (path: string, init?: RequestInit) => {
  const token = await accessToken(required("ACTIVITY_CACHE_AUDIENCE"));
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  return fetch(new URL(path, required("ACTIVITY_CACHE_URL")), {
    ...init,
    headers,
  });
};
