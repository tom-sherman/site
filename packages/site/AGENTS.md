<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Stylex Guide

See [stylex-authoring-guide.md](./docs/stylex-authoring-guide.md)

Prefer variant props for configuring the style of components, if you need to step outside of this for any reason (like if a variant is only used in a single place) accept a `style` prop with an appropriately typed `StyleXStyles` eg. `StyleXStyles<{ color: "red" | "blue" | "green" }>`.

For small one-off styles, [`@stylexjs/atoms`](https://stylexjs.com/docs/api/javascript/atoms) can be used directly inside stylex.props without creating a separate stylex.create namespace.
