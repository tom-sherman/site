import "server-only";
import { Client, type l } from "@atproto/lex";
import { app } from "@repo/atproto-client";
import type { ImageRef } from "./types";
import { truncate } from "./util";

export type PostView = app.bsky.feed.defs.PostView;

/** `getPosts` takes at most 25 URIs. */
const POSTS_PER_REQUEST = 25;

const appview = new Client("https://public.api.bsky.app");

/**
 * Posts from Bluesky's AppView, by at-uri. Posts that are missing (deleted,
 * or taken down) are left out.
 */
export async function getPostViews(
  uris: string[],
): Promise<Map<string, PostView>> {
  const batches: string[][] = [];
  for (let i = 0; i < uris.length; i += POSTS_PER_REQUEST) {
    batches.push(uris.slice(i, i + POSTS_PER_REQUEST));
  }
  const responses = await Promise.all(
    batches.map((batch) =>
      appview.call(app.bsky.feed.getPosts, {
        uris: batch as l.AtUriString[],
      }),
    ),
  );
  return new Map(
    responses.flatMap(({ posts }) => posts.map((post) => [post.uri, post])),
  );
}

/** The first image, from an images embed or a quote post with images. */
export function imageOf(view: PostView): ImageRef | undefined {
  const { images, recordWithMedia } = app.bsky.embed;
  const embed = view.embed;
  if (!embed) return undefined;
  const media = recordWithMedia.view.isTypeOf(embed) ? embed.media : embed;
  const [image] = images.view.isTypeOf(media) ? media.images : [];
  return image && { alt: image.alt || "Image", url: image.thumb };
}

/**
 * An image blob, resized by Bluesky's CDN. The blob itself can be megabytes,
 * served uncached by whichever PDS hosts the repo. `avatar_thumbnail` is a
 * small square crop; `feed_thumbnail` keeps the aspect ratio.
 */
export function cdnImageUrl(
  preset: "avatar_thumbnail" | "feed_thumbnail",
  did: string,
  cid: string,
) {
  return `https://cdn.bsky.app/img/${preset}/plain/${did}/${cid}@webp`;
}

/** `at://did/app.bsky.feed.post/rkey` on bsky.app. */
export function bskyUrl(uri: string) {
  const [, , did, , rkey] = uri.split("/");
  return `https://bsky.app/profile/${did}/post/${rkey}`;
}

/** A called-out thread's own title, or else how its first post starts. */
export function threadTitle(title: string | undefined, rootText: string) {
  return title ?? truncate(rootText, 80);
}
