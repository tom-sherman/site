import "server-only";
import { site } from "@repo/atproto-client";
import { cacheLife } from "next/cache";
import { pdsClient } from "./atproto";
import { DID } from "./profile";
import type { Timestamp } from "./types";

/** This site's `site.standard.publication`; its documents are the blog. */
export const PUBLICATION = `at://${DID}/site.standard.publication/3mxtzcwuyvkmh`;

export interface BlogPost {
  /** The document's at-uri. */
  id: string;
  /** On this site, e.g. `/blog/serverless-xstate`. */
  path: string;
  title: string;
  description?: string;
  tags: string[];
  publishedAt: Timestamp;
}

export interface Blog {
  /** Newest first. */
  posts: BlogPost[];
  /** When the list was read; the reference point for dates rendered on the server. */
  asOf: Timestamp;
}

/**
 * My `site.standard.document`s in {@link PUBLICATION}. Documents for other
 * publications (e.g. Leaflet's), and any without a `/blog/` path, are left out.
 */
export async function getBlog(): Promise<Blog> {
  "use cache";
  cacheLife("minutes");

  const asOf = Date.now();
  const client = await pdsClient(DID);
  const posts: BlogPost[] = [];
  for await (const doc of client.listAll(site.standard.document, {
    repo: DID,
    limit: 100,
  })) {
    if (!doc.valid) {
      console.warn(`Skipping invalid document ${doc.uri}`);
      continue;
    }
    const { site: publication, path, title, description, tags } = doc.value;
    if (publication !== PUBLICATION || !path?.startsWith("/blog/")) continue;
    posts.push({
      id: doc.uri,
      path,
      title,
      description: description || undefined,
      tags: tags ?? [],
      publishedAt: Date.parse(doc.value.publishedAt),
    });
  }
  posts.sort((a, b) => b.publishedAt - a.publishedAt);
  return { posts, asOf };
}
