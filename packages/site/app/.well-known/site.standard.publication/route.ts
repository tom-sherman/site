import { PUBLICATION } from "@/lib/data/blog";

/**
 * Proves this domain is my `site.standard.publication`'s, so readers can
 * trust documents that claim to be published here.
 */
export function GET() {
  return new Response(PUBLICATION, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
