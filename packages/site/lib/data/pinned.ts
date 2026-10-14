import "server-only";
import { getBlobCidString } from "@atproto/lex";
import { app, is, site } from "@repo/atproto-client";
import { cacheLife } from "next/cache";
import { getRecordOrNull, orNotFound, parseAtUri, pdsClient } from "./atproto";
import { toBlogPost } from "./blog";
import {
  bskyUrl,
  cdnImageUrl,
  getPostViews,
  imageOf,
  type PostView,
} from "./bluesky";
import { DID } from "./profile";
import type { ImageRef, Timestamp } from "./types";
import { httpUrl } from "./util";

export interface PinnedItem {
  /** The pinned record's at-uri. */
  id: string;
  kind: "thread" | "blog-post";
  url: string;
  title: string;
  publishedAt: Timestamp;
  image?: ImageRef;
  /** Shown as a card, rather than listed under "More highlights". */
  hero: boolean;
}

type Pin = is.sherman.unspecced.home.pinned.Item;

/** A pinned thread's first post, until its image is hydrated. */
type Found = PinnedItem & { root?: string };

/**
 * What's pinned to the homepage, in order, from my
 * `is.sherman.unspecced.home.pinned/self` record: `site.standard.document`s,
 * which are blog posts or threads. Pins can be of any age, so they're read
 * from their own records rather than the activity cache, which only keeps 30
 * days. A pin that's gone, or of anything else, is left out.
 */
export async function getPinned(): Promise<PinnedItem[]> {
  "use cache";
  cacheLife("minutes");

  const client = await pdsClient(DID);
  const pinned = await orNotFound(
    client.get(is.sherman.unspecced.home.pinned, { repo: DID }),
  );
  if (!pinned) return [];

  const found = (
    await Promise.all(
      pinned.value.items.map((pin) =>
        getPinnedItem(pin).catch((error: unknown) => {
          console.error(`Couldn't get pinned ${pin.uri}`, error);
          return null;
        }),
      ),
    )
  ).filter((item) => item !== null);

  // Only for threads' images, so pins still show without them.
  const views = await getPostViews(
    found.flatMap(({ root }) => (root ? [root] : [])),
  ).catch((error: unknown) => {
    console.error("Couldn't hydrate pinned threads from Bluesky", error);
    return new Map<string, PostView>();
  });

  return found.map(({ root, ...item }) => {
    const view = root ? views.get(root) : undefined;
    return view ? { ...item, image: imageOf(view) } : item;
  });
}

async function getPinnedItem({
  uri,
  hero = false,
}: Pin): Promise<Found | null> {
  const ref = parseAtUri(uri);
  if (ref?.collection !== site.standard.document.$nsid) {
    console.warn(`Can't show pinned ${uri}`);
    return null;
  }
  const client = await pdsClient(ref.repo);
  const doc = await orNotFound(
    client.get(site.standard.document, { repo: ref.repo, rkey: ref.rkey }),
  );
  if (!doc) return null;
  const root = threadRootOf(ref.repo, doc.value);
  return root
    ? getThread(doc.uri, doc.value, root, hero)
    : getBlogPost(doc.uri, ref.repo, doc.value, hero);
}

/**
 * The thread a document publishes as writing: the first post its content
 * points at, when that's a post in the document's own repo.
 */
function threadRootOf(repo: string, doc: site.standard.document.Main) {
  const ref = is.sherman.unspecced.documentref.$safeParse(doc.content);
  if (!ref.success) return undefined;
  const root = parseAtUri(ref.value.uri);
  return root?.collection === app.bsky.feed.post.$nsid && root.repo === repo
    ? ref.value.uri
    : undefined;
}

/** A thread, linking to its first post on Bluesky. */
function getThread(
  uri: string,
  doc: site.standard.document.Main,
  root: string,
  hero: boolean,
): Found {
  return {
    id: uri,
    kind: "thread",
    url: bskyUrl(root),
    publishedAt: Date.parse(doc.publishedAt),
    title: doc.title,
    hero,
    root,
  };
}

async function getBlogPost(
  uri: string,
  repo: string,
  doc: site.standard.document.Main,
  hero: boolean,
): Promise<Found | null> {
  // Blog posts have a page here, even ones whose canonical home is Leaflet.
  const url = toBlogPost(uri, doc)?.path ?? (await documentUrl(doc));
  if (!url) {
    console.warn(`Can't show pinned ${uri}: it has no URL`);
    return null;
  }
  const cover = doc.coverImage;
  return {
    id: uri,
    kind: "blog-post",
    url,
    publishedAt: Date.parse(doc.publishedAt),
    title: doc.title,
    // Decorative; the title is right next to it.
    image: cover && {
      alt: "",
      url: cdnImageUrl("feed_thumbnail", repo, getBlobCidString(cover)),
    },
    hero,
  };
}

/**
 * The document's `path` on its publication's URL. `site` is either the
 * publication record or, for a document without one, the URL itself. Only
 * the publication's `url` is needed, so it isn't validated as a whole.
 */
async function documentUrl({
  site: base,
  path = "",
}: site.standard.document.Main): Promise<string | undefined> {
  const publication = parseAtUri(base);
  const record =
    publication &&
    (await getRecordOrNull(
      await pdsClient(publication.repo),
      publication.collection,
      publication.rkey,
      publication.repo,
    ));
  const url = publication ? record?.value.url : base;
  return typeof url === "string"
    ? httpUrl(url.replace(/\/+$/, "") + path)
    : undefined;
}
