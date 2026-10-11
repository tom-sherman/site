import "server-only";

/**
 * Every environment variable the server reads, each by name so
 * `turbo/no-undeclared-env-vars` can check it against turbo.json.
 */
const serverEnv = {
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  ACTIVITY_CACHE_URL: process.env.ACTIVITY_CACHE_URL,
  ACTIVITY_CACHE_AUDIENCE: process.env.ACTIVITY_CACHE_AUDIENCE,
  OIDC_SIGNING_KEYS: process.env.OIDC_SIGNING_KEYS,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
};

type EnvName = keyof typeof serverEnv;

/** An environment variable that may be unset. */
export const env = (name: EnvName) => serverEnv[name] || undefined;

/** An environment variable that must be set. Dev defaults are in `.env.development`. */
export const required = (name: EnvName) => {
  const value = env(name);
  if (!value) {
    throw new Error(`${name} is not set. See packages/site/README.md.`);
  }
  return value;
};
