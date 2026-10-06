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

/**
 * Environment variables first, then `.env` (gitignored, for local overrides
 * and secrets), then under `pnpm dev` the committed `.env.development`
 * defaults. Loaded here rather than with Node's `--env-file-if-exists`, which
 * crashes `--watch` when the file doesn't exist.
 */
export const ConfigLayer = ConfigProvider.layerAdd(
  Effect.gen(function* () {
    const nodeEnv = yield* Config.String("NODE_ENV").pipe(
      Config.withDefault("production"),
    );
    const files = [".env"];
    if (nodeEnv === "development") files.push(".env.development");
    const providers = yield* Effect.forEach(files, envFile);
    return providers.reduce((a, b) => ConfigProvider.orElse(a, b));
  }),
).pipe(Layer.provide(NodeFileSystem.layer));
