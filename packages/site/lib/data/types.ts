/**
 * An image, or a placeholder where there's no `url` yet. `hue` tints the
 * placeholder; when omitted the accent is used (Tom's avatar).
 */
export interface ImageRef {
  alt: string;
  url?: string;
  hue?: number;
}

export interface Person {
  name: string;
  handle: string;
  avatar: ImageRef;
}

/** Epoch milliseconds. Plain numbers so they serialise across the RSC boundary. */
export type Timestamp = number;
