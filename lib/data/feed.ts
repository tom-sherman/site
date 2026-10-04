import "server-only";
import { cacheLife } from "next/cache";
import { TOM } from "./profile";
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
  year: number;
  /** 0–5 in half-star steps. */
  rating: number;
  excerpt: string;
  poster: ImageRef;
}

export interface PostItem extends FeedItemBase {
  kind: "post";
  network: "bluesky" | "x";
  author: Person;
  text: string;
  likes: number;
  replyTo?: Person;
}

export interface FilmRatingItem extends FeedItemBase {
  kind: "film-rating";
  title: string;
  year: number;
  rating: number;
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
  // Anchored to the hour so the stub doesn't change on every revalidation.
  const anchor = Math.floor(asOf / H) * H;
  return {
    items: buildStubItems(anchor).sort((a, b) => b.publishedAt - a.publishedAt),
    asOf,
    olderCursor: "2026-09-24",
  };
}

const M = 60_000;
const H = 60 * M;
const D = 24 * H;

const person = (name: string, handle: string, hue: number): Person => ({
  name,
  handle,
  avatar: { alt: name, hue },
});

const MIRA = person("Mira Okafor", "@mira.codes", 20);
const JUN = person("Jun Park", "@jun.dev", 250);
const SASHA = person("Sasha Lind", "@sasha.lind", 160);
const DEV = person("Dev Rao", "@devrao", 300);

const SONGS: [artist: string, title: string][] = [
  ["Cocteau Twins", "Heaven or Las Vegas"],
  ["Stereolab", "French Disko"],
  ["Broadcast", "Tears in the Typing Pool"],
  ["Boards of Canada", "Roygbiv"],
  ["Alvvays", "Belinda Says"],
  ["Khruangbin", "Maria También"],
  ["Jockstrap", "Greatest Hits"],
  ["Slowdive", "Alison"],
  ["Caroline Polachek", "Welcome to My Island"],
  ["Japanese Breakfast", "Be Sweet"],
  ["Aphex Twin", "Avril 14th"],
  ["Beach House", "Space Song"],
  ["Men I Trust", "Show Me How"],
  ["Yo La Tengo", "Autumn Sweater"],
];

// Tracks scrobbled per day, today first.
const TRACKS_PER_DAY = [14, 9, 6, 11, 4, 8, 5, 7, 3, 6];

function buildStubItems(now: Timestamp): FeedItem[] {
  const ago = (offset: number) => now - offset;

  const items: FeedItem[] = [
    {
      kind: "blog-post",
      id: "blog-design-tokens",
      url: "/blog/design-tokens-are-a-lie",
      publishedAt: ago(26 * H + 10 * M),
      title: "Design tokens are a lie we tell ourselves (and that's fine)",
      excerpt:
        "Every token system I've shipped eventually grew a token called something like color-text-weird. This is about making peace with that, and about the three layers that actually matter.",
      readingMinutes: 9,
      hero: { alt: "hero image — token layer diagram" },
    },
    {
      kind: "thread",
      id: "thread-40-teams",
      url: "https://bsky.app/profile/tomsherman.dev",
      network: "bluesky",
      publishedAt: ago(3 * D + 2 * H),
      title: "Shipping one design system to 40 teams",
      text: "Thread: everything I learned shipping one design system to 40 product teams without a single breaking change. Well. One breaking change. We'll get to it.",
      author: TOM,
      postCount: 12,
      image: { alt: "screenshot — the changelog entry" },
      participants: [MIRA, JUN, SASHA, DEV],
      replies: 48,
      reposts: 112,
      likes: 640,
    },
    {
      kind: "film-review",
      id: "review-perfect-days",
      url: "https://letterboxd.com/tomsherman",
      publishedAt: ago(5 * D + 3 * H),
      title: "Perfect Days",
      year: 2023,
      rating: 4.5,
      excerpt:
        "A man cleans public toilets in Tokyo and listens to cassettes. I left wanting to refactor nothing, ship nothing, and buy a film camera.",
      poster: { alt: "Perfect Days poster", hue: 200 },
    },
    {
      kind: "blog-post",
      id: "blog-web-component-migrations",
      url: "/blog/one-web-component-three-migrations",
      publishedAt: ago(9 * D + 5 * H),
      title: "One web component, three framework migrations",
      excerpt:
        "The date picker we wrote in 2021 has outlived Angular, a React rewrite, and a brief, regrettable flirtation with micro-frontends. Notes on writing UI that doesn't care who's rendering it.",
      readingMinutes: 14,
      hero: { alt: "diagram — component boundary" },
    },
    {
      kind: "post",
      id: "post-dialog",
      url: "https://bsky.app/profile/tomsherman.dev",
      network: "bluesky",
      publishedAt: ago(2 * H + 5 * M),
      author: TOM,
      text: "the fact that <dialog> just works now still makes me a little emotional",
      likes: 212,
    },
    {
      kind: "post",
      id: "post-popover",
      url: "https://bsky.app/profile/tomsherman.dev",
      network: "bluesky",
      publishedAt: ago(5 * H + 20 * M),
      author: TOM,
      replyTo: MIRA,
      text: "popover + anchor positioning is the combo. delete your tooltip library. feel the lightness.",
      likes: 88,
    },
    {
      kind: "film-rating",
      id: "rating-alien-romulus",
      url: "https://letterboxd.com/tomsherman",
      publishedAt: ago(30 * H),
      title: "Alien: Romulus",
      year: 2024,
      rating: 3,
      poster: { alt: "Alien: Romulus poster", hue: 140 },
    },
    {
      kind: "post",
      id: "post-weird-folder",
      url: "https://x.com/tomsherman",
      network: "x",
      publishedAt: ago(2 * D + 4 * H),
      author: TOM,
      text: "every design system should ship a /weird folder. components that are load-bearing but nobody can explain. honour them.",
      likes: 1200,
    },
    {
      kind: "post",
      id: "post-keyboard",
      url: "https://bsky.app/profile/tomsherman.dev",
      network: "bluesky",
      publishedAt: ago(4 * D + 6 * H),
      author: TOM,
      text: "new keyboard arrived. typing this very slowly and with great reverence",
      likes: 41,
    },
    {
      kind: "film-rating",
      id: "rating-past-lives",
      url: "https://letterboxd.com/tomsherman",
      publishedAt: ago(6 * D + 2 * H),
      title: "Past Lives",
      year: 2023,
      rating: 5,
      poster: { alt: "Past Lives poster", hue: 30 },
    },
    {
      kind: "post",
      id: "post-platform",
      url: "https://bsky.app/profile/tomsherman.dev",
      network: "bluesky",
      publishedAt: ago(7 * D + 3 * H),
      author: TOM,
      replyTo: JUN,
      text: "yes but have you tried just using the platform. (i'm sorry. i'll leave.)",
      likes: 19,
    },
  ];

  let songIndex = 0;
  TRACKS_PER_DAY.forEach((count, day) => {
    for (let k = 0; k < count; k++) {
      const [artist, title] = SONGS[songIndex % SONGS.length];
      items.push({
        kind: "track",
        id: `track-${songIndex}`,
        url: "https://www.last.fm/user/tomsherman",
        publishedAt: ago(day * D + 12 * M + k * 23 * M),
        title,
        artist,
        art: { alt: `${title} cover art`, hue: (songIndex * 47) % 360 },
      });
      songIndex++;
    }
  });

  const games: [offset: number, title: string, minutes: number, hue: number][] =
    [
      [4 * H, "Balatro", 134, 40],
      [D + 6 * H, "Outer Wilds", 65, 60],
      [3 * D + 5 * H, "Balatro", 48, 40],
      [6 * D + 4 * H, "Tetris Effect", 90, 280],
    ];
  games.forEach(([offset, title, minutes, hue], i) =>
    items.push({
      kind: "game-session",
      id: `game-${i}`,
      url: "https://steamcommunity.com",
      publishedAt: ago(offset),
      title,
      minutes,
      cover: { alt: `${title} cover`, hue },
    }),
  );

  const github: [offset: number, description: string][] = [
    [6 * H + 30 * M, "Pushed 3 commits to tomsherman/site"],
    [2 * D + H, "Opened PR #212 on open-ui/open-ui"],
    [5 * D + 7 * H, "Starred lit/lit"],
  ];
  github.forEach(([offset, description], i) =>
    items.push({
      kind: "github",
      id: `github-${i}`,
      url: "https://github.com/tom-sherman",
      publishedAt: ago(offset),
      description,
    }),
  );

  const episodes: [offset: number, show: string, episode: string][] = [
    [28 * H, "Severance", "S2E4"],
    [4 * D + 9 * H, "Taskmaster", "S18E2"],
  ];
  episodes.forEach(([offset, show, episode], i) =>
    items.push({
      kind: "episode",
      id: `episode-${i}`,
      url: "https://letterboxd.com/tomsherman",
      publishedAt: ago(offset),
      show,
      episode,
      art: { alt: `${show} artwork`, hue: 200 },
    }),
  );

  return items;
}
