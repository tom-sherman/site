import type { app } from "@repo/atproto-client";

/**
 * An image, or a placeholder where there's no `url` yet. `hue` tints the
 * placeholder; when omitted the accent is used (Tom's avatar).
 */
export interface ImageRef {
  alt: string;
  url?: string;
  hue?: number;
}

/** An image attached to a post: a thumbnail for the feed, and the full image. */
export interface PostImage {
  /** Empty when the author didn't write any. */
  alt: string;
  thumb: string;
  fullsize: string;
}

export interface Person {
  name: string;
  handle: string;
  avatar: ImageRef;
}

/** Epoch milliseconds. Plain numbers so they serialise across the RSC boundary. */
export type Timestamp = number;

/** A Bluesky rich text annotation: a mention, link or tag over a byte range of a post's text. */
export type Facet = app.bsky.richtext.facet.Main;
