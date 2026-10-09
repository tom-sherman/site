import "server-only";
import { cacheLife } from "next/cache";
import { getActivityFeedItems } from "./activity";
import type { ImageRef, Person, Timestamp } from "./types";

interface FeedItemBase {
  id: string;
  url: string;
  publishedAt: Timestamp;
}

export interface BlogPostItem extends FeedItemBase {
  kind: "blog-post";
  title: string;
  excerpt: string;
  readingMinutes: number;
  hero: ImageRef;
}

export interface ThreadItem extends FeedItemBase {
  kind: "thread";
  network: "bluesky";
  /** Short title used where the full first post won't fit (pinned rail). */
  title: string;
  text: string;
  author: Person;
  postCount: number;
  image?: ImageRef;
  participants: Person[];
  replies: number;
  reposts: number;
  likes: number;
}

export interface FilmReviewItem extends FeedItemBase {
  kind: "film-review";
  title: string;
  year?: number;
  /** 0.5–5 in half-star steps; reviews don't need one. */
  rating?: number;
  /** Given a heart on Letterboxd. */
  liked: boolean;
  excerpt: string;
  poster: ImageRef;
}

export interface PostItem extends FeedItemBase {
  kind: "post";
  network: "bluesky" | "x";
  author: Person;
  text: string;
  likes: number;
}

/** A Bluesky post of mine replying to another post. */
export interface ReplyItem extends FeedItemBase {
  kind: "reply";
  network: "bluesky";
  text: string;
  /**
   * Who it replies to, or for a reply to one of my own posts, how that post
   * starts; and where the post it replies to is. Missing when it couldn't be
   * hydrated.
   */
  replyTo?: { url: string } & (
    { kind: "person"; person: Person } | { kind: "self"; quote: string }
  );
}

/** A Bluesky post I liked. */
export interface LikeItem extends FeedItemBase {
  kind: "like";
  network: "bluesky";
  /** Who wrote the liked post; missing when it couldn't be hydrated. */
  author?: Person;
}

export interface FilmRatingItem extends FeedItemBase {
  kind: "film-rating";
  title: string;
  year?: number;
  rating: number;
  /** Given a heart on Letterboxd. */
  liked: boolean;
  poster: ImageRef;
}

export interface TrackItem extends FeedItemBase {
  kind: "track";
  title: string;
  artist: string;
  art: ImageRef;
}

export interface GameSessionItem extends FeedItemBase {
  kind: "game-session";
  title: string;
  minutes: number;
  cover: ImageRef;
}

export interface EpisodeItem extends FeedItemBase {
  kind: "episode";
  show: string;
  episode: string;
  art: ImageRef;
}

export interface GitHubEventItem extends FeedItemBase {
  kind: "github";
  description: string;
}

export type FeedItem =
  | BlogPostItem
  | ThreadItem
  | FilmReviewItem
  | PostItem
  | ReplyItem
  | LikeItem
  | FilmRatingItem
  | TrackItem
  | GameSessionItem
  | EpisodeItem
  | GitHubEventItem;

export interface Feed {
  /** Newest first. */
  items: FeedItem[];
  /** When the feed was assembled; the reference point for relative times rendered on the server. */
  asOf: Timestamp;
  olderCursor: string | null;
}

export async function getFeed(): Promise<Feed> {
  "use cache";
  cacheLife("minutes");

  const asOf = Date.now();
  // A broken activity cache shouldn't take the page down with it.
  const activity = await getActivityFeedItems().catch((error: unknown) => {
    console.error("Couldn't get activity", error);
    return [];
  });
  return {
    // Newest first, as the activity cache serves it.
    items: activity,
    asOf,
    // The activity cache only keeps 30 days, and all of it is on this page.
    olderCursor: null,
  };
}
