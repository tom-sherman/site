import type { FeedItem } from "./data/feed";
import { formatMinutes } from "./time";

export type FeedCategory =
  "writing" | "posts" | "film" | "music" | "games" | "code";

/**
 * High items are rare and get cards, medium items get a plain row, low items
 * are passive activity and collapse into one summary row per day.
 */
export type Priority = "high" | "medium" | "low";

/** Type icons are text set in the mono font. Don't swap them for an icon set. */
export const GLYPHS = {
  all: "*",
  writing: "¶",
  bluesky: "✱",
  x: "✕",
  film: "◐",
  music: "♫",
  games: "▶",
  code: "⌥",
  pinned: "◆",
  external: "↗",
  cycle: "⇄",
} as const;

export const CATEGORIES: { id: FeedCategory; glyph: string; label: string }[] =
  [
    { id: "writing", glyph: GLYPHS.writing, label: "Writing" },
    { id: "posts", glyph: GLYPHS.bluesky, label: "Posts" },
    { id: "film", glyph: GLYPHS.film, label: "Film" },
    { id: "music", glyph: GLYPHS.music, label: "Music" },
    { id: "games", glyph: GLYPHS.games, label: "Games" },
    { id: "code", glyph: GLYPHS.code, label: "Code" },
  ];

export function categoryOf(item: FeedItem): FeedCategory {
  switch (item.kind) {
    case "blog-post":
      return "writing";
    case "thread":
    case "post":
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

export function glyphOf(item: FeedItem): string {
  if (item.kind === "post" || item.kind === "thread") {
    return GLYPHS[item.network];
  }
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
