/**
 * The old site at tom-sherman.com, which now redirects here. Its posts were
 * at `/blog/{slug}`; these are their pages here, by old slug.
 */
export const LEGACY_POSTS: Record<string, string> = {
  "is-a-burrito-a-monad": "/blog/is-a-burrito-a-monad-3lzishlotep23",
  "running-jest-tests-in-a-browser":
    "/blog/running-jest-tests-in-browser-3lzit6hdqfj2e",
  "converting-to-github-discussions":
    "/blog/converting-to-github-discussions-3lzitai3jr726",
  "types-considered-harmful": "/blog/types-considered-harmful-3lzitbrlc3a2r",
  "remix-typescript-satisfies":
    "/blog/remix-typescript-satisfies-3lzithq2rvm2u",
  "remix-mastdodon-domain-alias":
    "/blog/mastodon-domain-alias-on-remix-3lzitkf22a42q",
  "dynamic-og-image-cloudflare-workers":
    "/blog/dynamic-og-image-cloudflare-workers-3lzitl7rpod2y",
  "serverless-xstate": "/blog/serverless-xstate-3lzitnvoxb32y",
  "treating-anchors-as-clientside-remix-links":
    "/blog/treating-anchors-as-clientside-remix-links-3lzitokb6qd2y",
  "pattern-matched-types-proposal":
    "/blog/typescript-pattern-matched-types-proposal-3lzitpj6c432y",
  "remix-suspense-for-client-only-components":
    "/blog/remix-suspense-for-client-only-components-3lzitqdpck726",
  "type-safe-remix-cloudflare-loader-context":
    "/blog/type-safe-remix-cloudflare-loader-context-3lzitr464u32y",
  "designing-a-new-rsc-framework":
    "/blog/designing-a-new-rsc-framework-3lzitsy55242e",
  "row-level-security-server-components":
    "/blog/row-level-security-server-components-3lzitvfutie2e",
};

/** The old site's URL for a post here, if it had one. */
export function legacyUrlOf(path: string): string | undefined {
  const slug = Object.keys(LEGACY_POSTS).find(
    (slug) => LEGACY_POSTS[slug] === path,
  );
  return slug && `https://tom-sherman.com/blog/${slug}`;
}
