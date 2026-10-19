import "server-only";
import { getBlobCidString, lexParse } from "@atproto/lex";
import { app, is, pub, site } from "@repo/atproto-client";
import { cacheLife } from "next/cache";
import {
  getRecordOrNull,
  myPds,
  orNotFound,
  parseAtUri,
  pdsClient,
  resolvePds,
} from "./atproto";
import { DID } from "./profile";
import { getThread, type Thread } from "./thread";
import type { Timestamp } from "./types";

/**
 * The publications whose documents make up the blog. A document's `path` is
 * `prefix`, optionally a slug for people to read and `-`, then its rkey; its
 * page here is `/blog/` and the rest. Anything else is left out.
 */
const PUBLICATIONS = [
  {
    // This site's own.
    uri: `at://${DID}/site.standard.publication/3mxtzcwuyvkmh`,
    url: "https://tom.sherman.is",
    prefix: "/blog/",
  },
  {
    // Leaflet's. Its posts are shown here too, but they live on Leaflet.
    uri: `at://${DID}/site.standard.publication/3lxu2lwfe222h`,
    url: "https://leaflet.tom.sherman.is",
    prefix: "/",
  },
] as const;

/** This site's `site.standard.publication`. */
export const PUBLICATION = PUBLICATIONS[0].uri;

export interface BlogPost {
  /** The document's at-uri. */
  id: string;
  /**
   * An article, or a Bluesky thread published as writing (see
   * {@link threadRootOf}).
   */
  kind: "article" | "thread";
  /** Its page here, `/blog/{slug}-{rkey}` or `/blog/{rkey}`. */
  path: string;
  title: string;
  description?: string;
  tags: string[];
  publishedAt: Timestamp;
  /** Where the post canonically lives: this site, or Leaflet. */
  canonicalUrl: string;
  /** Whether it's in this site's own publication, rather than Leaflet's. */
  ownPublication: boolean;
}

export interface Blog {
  /** Newest first. */
  posts: BlogPost[];
  /** When the list was read; the reference point for dates rendered on the server. */
  asOf: Timestamp;
}

/** A TID, which is what documents' rkeys are. */
const RKEY = /^[2-7a-z]{13}$/;

/**
 * The rkey at the end of a post's page, `{slug}-{rkey}` or just `{rkey}`.
 * TIDs have no `-`, so it's everything after the last one.
 */
export function rkeyOf(segment: string): string | undefined {
  const rkey = segment.slice(segment.lastIndexOf("-") + 1);
  return RKEY.test(rkey) ? rkey : undefined;
}

/** My `site.standard.document`s in the blog's {@link PUBLICATIONS}. */
export async function getBlog(): Promise<Blog> {
  "use cache";
  cacheLife("minutes");

  const asOf = Date.now();
  const posts: BlogPost[] = [];
  for await (const doc of myPds.listAll(site.standard.document, {
    repo: DID,
    limit: 100,
  })) {
    if (!doc.valid) {
      console.warn(`Skipping invalid document ${doc.uri}`);
      continue;
    }
    const post = toBlogPost(doc.uri, doc.value);
    if (post) posts.push(post);
  }
  posts.sort((a, b) => b.publishedAt - a.publishedAt);
  return { posts, asOf };
}

/** A document as a blog post; `undefined` when it isn't part of the blog. */
export function toBlogPost(
  uri: string,
  value: site.standard.document.Main,
): BlogPost | undefined {
  const rkey = parseAtUri(uri)?.rkey;
  const publication = PUBLICATIONS.find((p) => p.uri === value.site);
  const { path = "" } = value;
  if (!rkey || !RKEY.test(rkey) || !publication) return;
  if (!path.startsWith(publication.prefix)) return;
  const rest = path.slice(publication.prefix.length);
  if (!new RegExp(`^([a-z0-9-]+-)?${rkey}$`, "i").test(rest)) return;
  return {
    id: uri,
    kind: threadRootOf(uri, value) ? "thread" : "article",
    path: `/blog/${rest}`,
    title: value.title,
    description: value.description || undefined,
    tags: value.tags ?? [],
    publishedAt: Date.parse(value.publishedAt),
    canonicalUrl: publication.url + path,
    ownPublication: publication.uri === PUBLICATION,
  };
}

/**
 * The thread a document publishes as writing: the first post its content
 * points at (with an `is.sherman.unspecced.documentref`), when that's a post
 * in the document's own repo.
 */
export function threadRootOf(
  uri: string,
  value: site.standard.document.Main,
): string | undefined {
  const ref = is.sherman.unspecced.documentref.$safeParse(value.content);
  if (!ref.success) return undefined;
  const root = parseAtUri(ref.value.uri);
  return root?.collection === app.bsky.feed.post.$nsid &&
    root.repo === parseAtUri(uri)?.repo
    ? ref.value.uri
    : undefined;
}

export type LeafletPage = pub.leaflet.pages.linearDocument.Main;

/** A post's body, in whichever format its document's `content` is. */
export type PostBody =
  | { format: "markdown"; markdown: string }
  /** `did` is the repo holding the blocks' blobs. */
  | { format: "leaflet"; did: string; pages: LeafletPage[] }
  | ({ format: "thread" } & Thread)
  | { format: "unsupported" };

export interface Post extends BlogPost {
  body: PostBody;
  readingMinutes: number;
  /** The Bluesky post to discuss it under. */
  bskyPostUri?: string;
}

/** The blog post with this rkey, or `null` if there isn't one. */
export async function getPost(rkey: string): Promise<Post | null> {
  "use cache";
  cacheLife("minutes");

  const doc = await orNotFound(
    myPds.get(site.standard.document, { repo: DID, rkey }),
  );
  const summary = doc && toBlogPost(doc.uri, doc.value);
  if (!summary) return null;
  const root = threadRootOf(doc.uri, doc.value);
  const body = root
    ? await getThreadBody(root)
    : await getBody(doc.value.content, DID);
  return {
    ...summary,
    body,
    readingMinutes: readingMinutes(
      body.format === "markdown"
        ? body.markdown
        : body.format === "leaflet"
          ? leafletText(body.pages)
          : body.format === "thread"
            ? [...body.posts, ...body.forks.flatMap((fork) => fork.posts)]
                .map((post) => post.text)
                .join(" ")
            : (doc.value.textContent ?? ""),
    ),
    bskyPostUri: doc.value.bskyPostRef?.uri,
  };
}

async function getBody(content: unknown, did: string): Promise<PostBody> {
  const ref = is.sherman.unspecced.documentref.$safeParse(content);
  if (ref.success) return getReferencedBody(ref.value.uri);

  const leaflet = pub.leaflet.content.$safeParse(content);
  if (leaflet.success) {
    const pages = leaflet.value.blobPages
      ? await getBlobPages(did, getBlobCidString(leaflet.value.blobPages))
      : leaflet.value.pages;
    return {
      format: "leaflet",
      did,
      // Canvases are free-form layouts that don't read top to bottom.
      pages: pages.filter((page) =>
        pub.leaflet.pages.linearDocument.$isTypeOf(page),
      ),
    };
  }

  console.warn("Unsupported document content", content);
  return { format: "unsupported" };
}

/**
 * A thread's posts, from Bluesky's AppView, which has their counts too. If
 * it can't be read, the post is shown as unsupported for now; it's only
 * cached for minutes.
 */
async function getThreadBody(root: string): Promise<PostBody> {
  const thread = await getThread(root).catch((error: unknown) => {
    console.error(`Couldn't get thread ${root}`, error);
    return null;
  });
  return thread ? { format: "thread", ...thread } : { format: "unsupported" };
}

/** The content of an `is.sherman.unspecced.documentref`: a WhiteWind entry's Markdown. */
async function getReferencedBody(uri: string): Promise<PostBody> {
  const ref = parseAtUri(uri);
  if (ref?.collection !== "com.whtwnd.blog.entry") {
    console.warn(`Can't read content from ${uri}`);
    return { format: "unsupported" };
  }
  // WhiteWind doesn't publish its lexicon, so only `content` is checked.
  const entry = await getRecordOrNull(
    pdsClient(ref.repo),
    ref.collection,
    ref.rkey,
    ref.repo,
  );
  const markdown = entry?.value.content;
  return typeof markdown === "string"
    ? { format: "markdown", markdown }
    : { format: "unsupported" };
}

/** Leaflet's pages, when they're too big for the record and are in a blob instead. */
async function getBlobPages(did: string, cid: string) {
  const url = new URL("/xrpc/com.atproto.sync.getBlob", await resolvePds(did));
  url.search = new URLSearchParams({ did, cid }).toString();
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Couldn't fetch Leaflet pages ${cid}: ${response.status}`);
  return pub.leaflet.content.$parse({
    pages: lexParse(await response.text()),
  }).pages;
}

/** A Leaflet document's text, for its reading time. */
function leafletText(pages: LeafletPage[]) {
  return pages
    .flatMap((page) => page.blocks)
    .map(({ block }) =>
      "plaintext" in block && typeof block.plaintext === "string"
        ? block.plaintext
        : "",
    )
    .join(" ");
}

/** At 230 words a minute, rounded up. */
function readingMinutes(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 230));
}
