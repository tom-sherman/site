import { getBlog } from "@/lib/data/blog";
import { legacyUrlOf } from "@/lib/legacy";

const SITE = "https://tom.sherman.is";

/**
 * The blog's RSS feed, where the old site's was. Its posts keep their old
 * guids so readers subscribed there don't see them as new.
 */
export async function GET() {
  const { posts } = await getBlog();
  const items = posts.map((post) => {
    const guid = legacyUrlOf(post.path) ?? post.canonicalUrl;
    return `
    <item>
      <title>${escape(post.title)}</title>
      <link>${escape(post.canonicalUrl)}</link>
      <guid isPermaLink="true">${escape(guid)}</guid>
      <pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>${
        post.description
          ? `
      <description>${escape(post.description)}</description>`
          : ""
      }
    </item>`;
  });

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Tom Sherman's blog</title>
    <link>${SITE}/blog</link>
    <atom:link href="${SITE}/blog/rss.xml" rel="self" type="application/rss+xml" />
    <description>Writing by Tom Sherman, mostly about the web and TypeScript.</description>
    <language>en-gb</language>${items.join("")}
  </channel>
</rss>
`;

  return new Response(rss, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}

function escape(text: string) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
