<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Stylex Guide

See [stylex-authoring-guide.md](./docs/stylex-authoring-guide.md)

# Vendored reference repos

`repos/` contains upstream source trees vendored with `git subtree` as read-only reference material:

- `repos/effect`: [Effect-TS/effect](https://github.com/Effect-TS/effect) (Effect v4)

When working with these libraries:

- Prefer examples and patterns froluding its tests and docs) overguesses or web search results.
- Do not edit files under `repos/`
- Do not import from `repos/`. Application code imports from the normal package dependencies (e.g. `effect`).
