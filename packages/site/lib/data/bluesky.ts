import "server-only";
import { Client, getBlobCidString, type l } from "@atproto/lex";
import { app } from "@repo/atproto-client";
import type { ImageRef, PostImage } from "./types";
import { truncate } from "./util";

export type PostView = app.bsky.feed.defs.PostView;
export type ProfileView = app.bsky.actor.defs.ProfileViewDetailed;

/** `getPosts` takes at most 25 URIs, and `getProfiles` 25 actors. */
const PER_REQUEST = 25;

const appview = new Client("https://public.api.bsky.app");

/**
 * Posts from Bluesky's AppView, by at-uri. Posts that are missing (deleted,
 * or taken down) are left out.
 */
export async function getPostViews(
  uris: string[],
): Promise<Map<string, PostView>> {
  const responses = await Promise.all(
    batchesOf(uris).map((batch) =>
      appview.call(app.bsky.feed.getPosts, {
        uris: batch as l.AtUriString[],
      }),
    ),
  );
  return new Map(
    responses.flatMap(({ posts }) => posts.map((post) => [post.uri, post])),
  );
}

/**
 * Profiles from Bluesky's AppView, by DID. Accounts that are missing
 * (deleted, deactivated, or taken down) are left out.
 */
export async function getProfileViews(
  dids: string[],
): Promise<Map<string, ProfileView>> {
  const responses = await Promise.all(
    batchesOf(dids).map((batch) =>
      appview.call(app.bsky.actor.getProfiles, {
        actors: batch as l.DidString[],
      }),
    ),
  );
  return new Map(
    responses.flatMap(({ profiles }) =>
      profiles.map((profile) => [profile.did, profile]),
    ),
  );
}

function batchesOf(items: string[]): string[][] {
  const batches: string[][] = [];
  for (let i = 0; i < items.length; i += PER_REQUEST) {
    batches.push(items.slice(i, i + PER_REQUEST));
  }
  return batches;
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
 * A post's images, from an images or gallery embed or a quote post with
 * either, on Bluesky's CDN. `did` is the post's author, whose repo has them.
 */
export function postImagesOf(
  post: app.bsky.feed.post.Main,
  did: string,
): PostImage[] {
  const { images, gallery, recordWithMedia } = app.bsky.embed;
  const embed = post.embed;
  if (!embed) return [];
  const media = recordWithMedia.$isTypeOf(embed) ? embed.media : embed;
  const found = images.$isTypeOf(media)
    ? media.images
    : gallery.$isTypeOf(media)
      ? media.items.filter((item) => gallery.image.isTypeOf(item))
      : [];
  return found.map(({ alt, image }) => {
    const cid = getBlobCidString(image);
    return {
      alt,
      thumb: cdnImageUrl("feed_thumbnail", did, cid),
      fullsize: cdnImageUrl("feed_fullsize", did, cid),
    };
  });
}

/**
 * An image blob, resized by Bluesky's CDN. The blob itself can be megabytes,
 * served uncached by whichever PDS hosts the repo. `avatar_thumbnail` is a
 * small square crop; `feed_thumbnail` and `feed_fullsize` keep the aspect
 * ratio.
 */
export function cdnImageUrl(
  preset: "avatar_thumbnail" | "feed_thumbnail" | "feed_fullsize",
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

/** An account on bsky.app, by DID. */
export function bskyProfileUrl(did: string) {
  return `https://bsky.app/profile/${did}`;
}

/** A called-out thread's own title, or else how its first post starts. */
export function threadTitle(title: string | undefined, rootText: string) {
  return title ?? truncate(rootText, 80);
}
