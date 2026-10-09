import type { GlyphName } from "./components/Glyph";
import type { FeedItem } from "./data/feed";
import { formatMinutes } from "./time";

export type FeedCategory =
  "writing" | "posts" | "film" | "music" | "games" | "code";

/**
 * High items are rare and get cards, medium items get a plain row, low items
 * are passive activity and collapse into one summary row per day.
 */
export type Priority = "high" | "medium" | "low";

export const CATEGORIES: {
  id: FeedCategory;
  glyph: GlyphName;
  label: string;
}[] = [
  { id: "writing", glyph: "writing", label: "Writing" },
  { id: "posts", glyph: "bluesky", label: "Posts" },
  { id: "film", glyph: "film", label: "Film" },
  { id: "music", glyph: "music", label: "Music" },
  { id: "games", glyph: "games", label: "Games" },
  { id: "code", glyph: "code", label: "Code" },
];

export function categoryOf(item: FeedItem): FeedCategory {
  switch (item.kind) {
    case "blog-post":
      return "writing";
    case "thread":
    case "post":
    case "reply":
    case "like":
      return "posts";
    case "film-review":
    case "film-rating":
    case "episode":
      return "film";
    case "track":
      return "music";
    case "game-session":
      return "games";
    case "github":
      return "code";
  }
}

export function priorityOf(item: FeedItem): Priority {
  switch (item.kind) {
    case "blog-post":
    case "thread":
    case "film-review":
      return "high";
    case "post":
    case "film-rating":
      return "medium";
    case "reply":
    case "like":
    case "track":
    case "game-session":
    case "episode":
    case "github":
      return "low";
  }
}

export type HighPriorityItem = Extract<
  FeedItem,
  { kind: "blog-post" | "thread" | "film-review" }
>;

export type MediumPriorityItem = Extract<
  FeedItem,
  { kind: "post" | "film-rating" }
>;

export function isHighPriority(item: FeedItem): item is HighPriorityItem {
  return priorityOf(item) === "high";
}

export function isMediumPriority(item: FeedItem): item is MediumPriorityItem {
  return priorityOf(item) === "medium";
}

export function glyphOf(item: FeedItem): GlyphName {
  if (item.kind === "reply") return "reply";
  if ("network" in item) return item.network;
  return CATEGORIES.find((c) => c.id === categoryOf(item))!.glyph;
}

/** `★★★★½` */
export function formatStars(rating: number): string {
  return "★".repeat(Math.floor(rating)) + (rating % 1 ? "½" : "");
}

/** `212`, `1.2k` */
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
}

export function labelOf(item: FeedItem): string {
  switch (item.kind) {
    case "blog-post":
      return "Blog post";
    case "thread":
      return "Bluesky thread";
    case "film-review":
      return "Film review";
    case "post":
      return item.network === "x" ? "X" : "Bluesky";
    case "reply":
      return !item.replyTo
        ? "Replied to a post"
        : item.replyTo.kind === "self"
          ? `Replied to “${item.replyTo.quote}”`
          : `Replied to ${item.replyTo.person.handle}`;
    case "like":
      return item.author
        ? `Liked a post by ${item.author.handle}`
        : "Liked a post";
    case "film-rating":
      return "Rated on Letterboxd";
    case "track":
      return `${item.title} — ${item.artist}`;
    case "game-session":
      return `Played ${item.title} · ${formatMinutes(item.minutes)}`;
    case "episode":
      return `Watched ${item.show} — ${item.episode}`;
    case "github":
      return item.description;
  }
}
