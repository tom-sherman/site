import base from "@repo/lint";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [base],
  plugins: ["import", "react", "nextjs", "jsx-a11y"],
  rules: {
    "react/rules-of-hooks": "error",
    "react/exhaustive-deps": "warn",

    // React Compiler, matching eslint-plugin-react-hooks' recommended set.
    "react/static-components": "error",
    "react/use-memo": "error",
    "react/preserve-manual-memoization": "error",
    "react/incompatible-library": "warn",
    "react/immutability": "error",
    "react/globals": "error",
    "react/refs": "error",
    "react/set-state-in-effect": "error",
    "react/error-boundaries": "error",
    "react/purity": "error",
    "react/set-state-in-render": "error",
    "react/unsupported-syntax": "warn",

    "react/react-in-jsx-scope": "off",
    // `<span role="img">` placeholders hold a caption, which `<img>` can't.
    "jsx-a11y/prefer-tag-over-role": "off",
    "import/no-anonymous-default-export": "warn",
  },
  ignorePatterns: [
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "design_handoff_personal_feed/**",
  ],
});
