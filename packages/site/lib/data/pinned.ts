import "server-only";
import { getBlobCidString } from "@atproto/lex";
import { app, is, site } from "@repo/atproto-client";
import { cacheLife } from "next/cache";
import { getRecordOrNull, orNotFound, parseAtUri, pdsClient } from "./atproto";
import { getBlog } from "./blog";
import {
  bskyUrl,
  cdnImageUrl,
  getPostViews,
  imageOf,
  type PostView,
  threadTitle,
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
type Ref = NonNullable<ReturnType<typeof parseAtUri>>;

/** A pinned thread's first post, until its image is hydrated. */
type Found = PinnedItem & { root?: string };

/**
 * What's pinned to the homepage, in order, from my
 * `is.sherman.unspecced.home.pinned/self` record: threads
 * (`is.sherman.unspecced.thread`) and blog posts (`site.standard.document`).
 * Pins can be of any age, so they're read from their own records rather than
 * the activity cache, which only keeps 30 days. A pin that's gone, or of
 * anything else, is left out.
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
  switch (ref?.collection) {
    case is.sherman.unspecced.thread.$nsid:
      return getThread(ref, hero);
    case site.standard.document.$nsid:
      return getDocument(ref, hero);
    default:
      console.warn(`Can't show pinned ${uri}`);
      return null;
  }
}

/** A thread and its first post, which is in the same repo. */
async function getThread(
  { repo, rkey }: Ref,
  hero: boolean,
): Promise<Found | null> {
  const client = await pdsClient(repo);
  const thread = await orNotFound(
    client.get(is.sherman.unspecced.thread, { repo, rkey }),
  );
  const rootRkey = thread && parseAtUri(thread.value.subject.uri)?.rkey;
  if (!rootRkey) return null;
  const root = await orNotFound(
    client.get(app.bsky.feed.post, { repo, rkey: rootRkey }),
  );
  if (!root) return null;
  return {
    id: thread.uri,
    kind: "thread",
    url: bskyUrl(root.uri),
    // As in the feed, when it was called out as a thread.
    publishedAt: Date.parse(thread.value.createdAt),
    title: threadTitle(thread.value.title, root.value.text),
    hero,
    root: root.uri,
  };
}

async function getDocument(
  { repo, rkey }: Ref,
  hero: boolean,
): Promise<Found | null> {
  const client = await pdsClient(repo);
  const doc = await orNotFound(
    client.get(site.standard.document, { repo, rkey }),
  );
  if (!doc) return null;
  // Blog posts have a page here, even ones whose canonical home is Leaflet.
  const post = (await getBlog()).posts.find((post) => post.id === doc.uri);
  const url = post?.path ?? (await documentUrl(doc.value));
  if (!url) {
    console.warn(`Can't show pinned ${doc.uri}: it has no URL`);
    return null;
  }
  const cover = doc.value.coverImage;
  return {
    id: doc.uri,
    kind: "blog-post",
    url,
    publishedAt: Date.parse(doc.value.publishedAt),
    title: doc.value.title,
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
