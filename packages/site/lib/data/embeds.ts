import "server-only";
import { app } from "@repo/atproto-client";
import { cacheLife } from "next/cache";
import { getTweet } from "react-tweet/api";
import { bskyUrl, getPostViews, postImagesOf } from "./bluesky";
import type { Facet, ImageRef, Person, Timestamp } from "./types";

/** A Bluesky post or a tweet, embedded in a blog post. */
export interface SocialPost {
  network: "bluesky" | "x";
  url: string;
  author: Person;
  text: string;
  /** Bluesky's; tweets' text is plain. */
  facets?: Facet[];
  image?: ImageRef;
  createdAt: Timestamp;
}

/** `null` when the post is gone. */
export async function getBskyEmbed(uri: string): Promise<SocialPost | null> {
  "use cache";
  cacheLife("hours");

  const view = (await getPostViews([uri])).get(uri);
  const post = view && app.bsky.feed.post.$safeParse(view.record);
  if (!view || !post?.success) return null;
  const [image] = postImagesOf(post.value, view.author.did);
  return {
    network: "bluesky",
    url: bskyUrl(view.uri),
    author: {
      name: view.author.displayName || view.author.handle,
      handle: `@${view.author.handle}`,
      avatar: { alt: "", url: view.author.avatar },
    },
    text: post.value.text,
    facets: post.value.facets,
    image: image && { alt: image.alt, url: image.thumb },
    createdAt: Date.parse(post.value.createdAt),
  };
}

/** `null` when the tweet is gone, or X won't serve it. */
export async function getTweetEmbed(id: string): Promise<SocialPost | null> {
  "use cache";
  cacheLife("days");

  const tweet = await getTweet(id).catch((error: unknown) => {
    console.error(`Couldn't get tweet ${id}`, error);
    return undefined;
  });
  if (!tweet) return null;
  // The range is in code points, and leaves out reply mentions and media links.
  const [start, end] = tweet.display_text_range;
  let text = Array.from(tweet.text).slice(start, end).join("");
  for (const { url, display_url } of tweet.entities?.urls ?? [])
    text = text.replace(url, display_url);
  const [photo] = tweet.photos ?? [];
  return {
    network: "x",
    url: `https://x.com/${tweet.user.screen_name}/status/${tweet.id_str}`,
    author: {
      name: tweet.user.name,
      handle: `@${tweet.user.screen_name}`,
      avatar: { alt: "", url: tweet.user.profile_image_url_https },
    },
    text: decodeEntities(text),
    image: photo && { alt: "", url: photo.url },
    createdAt: Date.parse(tweet.created_at),
  };
}

/** Tweet text comes HTML-escaped. */
function decodeEntities(text: string) {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
