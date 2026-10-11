import { NodeFileSystem } from "@effect/platform-node";
import { Config, ConfigProvider, Effect, Layer, Schema } from "effect";

export class MissingConfig extends Schema.TaggedError<MissingConfig>()(
  "MissingConfig",
  { variable: Schema.String },
) {
  override get message() {
    return `${this.variable} is not set. Set it in the environment or in packages/activity-cache/.env (see README.md).`;
  }
}

/** A string that must be configured, with an error that says so plainly. */
export const required = Effect.fn("required")(function* (name: string) {
  const value = yield* Config.option(Config.String(name));
  if (value._tag === "None")
    return yield* new MissingConfig({ variable: name });
  return value.value;
});

const envFile = (path: string) =>
  ConfigProvider.fromDotEnv({ path }).pipe(
    Effect.catchIf(
      (error) => error.reason._tag === "NotFound",
      () => Effect.succeed(ConfigProvider.fromUnknown({})),
    ),
  );

/** Drops unset variables, which `ConfigProvider.fromEnv` doesn't accept. */
const set = (env: Record<string, string | undefined>) =>
  Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );

/**
 * Every environment variable the service reads, each by name so
 * `turbo/no-undeclared-env-vars` can check it against turbo.json. Config
 * reads nothing else from the environment, so a new variable goes here too.
 */
const environment = ConfigProvider.fromEnv({
  env: set({
    PORT: process.env.PORT,
    DATABASE_PATH: process.env.DATABASE_PATH,
    ATPROTO_DID: process.env.ATPROTO_DID,
    GITHUB_USER: process.env.GITHUB_USER,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    LETTERBOXD_USER: process.env.LETTERBOXD_USER,
    JETSTREAM_URL: process.env.JETSTREAM_URL,
    OIDC_ISSUER: process.env.OIDC_ISSUER,
    OIDC_AUDIENCE: process.env.OIDC_AUDIENCE,
  }),
});

/**
 * Environment variables first, then `.env` (gitignored, for local overrides
 * and secrets), then under `pnpm dev` the committed `.env.development`
 * defaults. Loaded here rather than with Node's `--env-file-if-exists`, which
 * crashes `--watch` when the file doesn't exist.
 */
export const ConfigLayer = ConfigProvider.layer(
  Effect.gen(function* () {
    const files = [".env"];
    if (process.env.NODE_ENV === "development") files.push(".env.development");
    const providers = yield* Effect.forEach(files, envFile);
    return [environment, ...providers].reduce((a, b) =>
      ConfigProvider.orElse(a, b),
    );
  }),
).pipe(Layer.provide(NodeFileSystem.layer));
