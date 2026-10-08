import "server-only";

/** An environment variable that must be set. Dev defaults are in `.env.development`. */
export const required = (name: string) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. See packages/site/README.md.`);
  }
  return value;
};
