import { defineConfig } from "oxlint";

/**
 * Shared base for every package: TypeScript with type-aware rules, the
 * correctness category as errors, and Turborepo's check for undeclared env
 * vars. Packages extend it in their own `oxlint.config.ts` and add framework
 * plugins there.
 */
export default defineConfig({
  plugins: ["eslint", "typescript", "unicorn", "oxc"],
  jsPlugins: ["eslint-plugin-turbo"],
  options: {
    typeAware: true,
  },
  categories: {
    correctness: "error",
    // Formatting is Prettier's job.
    style: "off",
  },
  rules: {
    // `_` marks a parameter that's there for its type or position.
    "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    // Env vars must be declared in turbo.json so they're part of task hashes.
    "turbo/no-undeclared-env-vars": "error",
  },
});
