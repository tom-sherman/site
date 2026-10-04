/**
 * Every image on the page is a placeholder until real assets exist. `hue`
 * tints the placeholder; when omitted the accent is used (Tom's avatar).
 */
export interface ImageRef {
  alt: string;
  hue?: number;
}

export interface Person {
  name: string;
  handle: string;
  avatar: ImageRef;
}

/** Epoch milliseconds. Plain numbers so they serialise across the RSC boundary. */
export type Timestamp = number;
