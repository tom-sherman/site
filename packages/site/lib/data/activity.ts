import "server-only";
import type { ActivityItem } from "@repo/activity-cache/api";
import { app } from "@repo/atproto-client";
import { activityCache } from "../activity-cache";
import {
  bskyUrl,
  getPostViews,
  imageOf,
  type PostView,
  threadTitle,
} from "./bluesky";
import type {
  FeedItem,
  GitHubEventItem,
  LikeItem,
  PostItem,
  ReplyItem,
  ThreadItem,
  TrackItem,
} from "./feed";
import { lastFmTrackUrl } from "./music";
import { DID, TOM } from "./profile";
import type { Person } from "./types";
import { httpUrl, hueOf, truncate } from "./util";

type Of<T extends ActivityItem["type"]> = Extract<ActivityItem, { type: T }>;
type Post = Of<"app.bsky.feed.post">;
type Thread = Of<"is.sherman.unspecced.thread">;
type Like = Of<"app.bsky.feed.like">;
type Play = Of<"fm.teal.feed.play">;
type GitHubEvent = Extract<ActivityItem, { type: `github.${string}` }>;

/** How much of my own post a self-reply quotes. */
const QUOTE_LENGTH = 40;

/** The cache's page size limit; its 30 days is usually one page. */
const PAGE_SIZE = 500;

/**
 * Everything in the activity cache (the last 30 days) as feed items. Posts
 * are hydrated from Bluesky's AppView for counts, authors and images; if
 * that fails they're shown from their records alone.
 */
export async function getActivityFeedItems(): Promise<FeedItem[]> {
  const activity = await getAllActivity();
  const views = await getPostViews(urisToHydrate(activity)).catch(
    (error: unknown) => {
      console.error("Couldn't hydrate posts from Bluesky", error);
      return new Map<string, PostView>();
    },
  );
  // My posts' text, for self-replies, so quoting them doesn't need the AppView.
  const texts = new Map<string, string>();
  for (const item of activity) {
    const posts =
      item.type === "app.bsky.feed.post"
        ? [item]
        : item.type === "is.sherman.unspecced.thread"
          ? item.members
          : [];
    for (const post of posts) texts.set(post.id, post.data.text);
  }
  return activity.flatMap((item) => toFeedItem(item, { views, texts }) ?? []);
}

interface Hydration {
  /** Posts from the AppView, by at-uri. */
  views: ReadonlyMap<string, PostView>;
  /** The text of my cached posts, by at-uri. */
  texts: ReadonlyMap<string, string>;
}

async function getAllActivity(): Promise<ActivityItem[]> {
  const items: ActivityItem[] = [];
  let before: string | undefined;
  do {
    const page = await activityCache((cache) =>
      cache.activity.list({ query: { limit: PAGE_SIZE, before } }),
    );
    items.push(...page.items);
    before = page.cursor ?? undefined;
  } while (before);
  return items;
}

/** `undefined` for activity the feed leaves out. */
function toFeedItem(
  item: ActivityItem,
  hydration: Hydration,
): FeedItem | undefined {
  switch (item.type) {
    case "app.bsky.feed.post":
      return postItem(item, hydration);
    case "is.sherman.unspecced.thread":
      return threadItem(item, hydration.views);
    case "app.bsky.feed.like":
      return likeItem(item, hydration.views);
    case "fm.teal.feed.play":
      return trackItem(item);
    default:
      return gitHubItem(item);
  }
}

/**
 * Posts and thread posts, the posts replies reply to (for who they're
 * replying to), and the posts I liked.
 */
function urisToHydrate(activity: ReadonlyArray<ActivityItem>): string[] {
  const uris = new Set<string>();
  for (const item of activity) {
    if (item.type === "app.bsky.feed.post") {
      uris.add(item.data.reply ? item.data.reply.parent.uri : item.id);
    } else if (item.type === "is.sherman.unspecced.thread") {
      for (const post of item.members) uris.add(post.id);
    } else if (
      item.type === "app.bsky.feed.like" &&
      isPostUri(item.data.subject.uri)
    ) {
      uris.add(item.data.subject.uri);
    }
  }
  return [...uris];
}

function postItem(post: Post, hydration: Hydration): PostItem | ReplyItem {
  if (post.data.reply) {
    return {
      kind: "reply",
      id: post.id,
      url: bskyUrl(post.id),
      publishedAt: post.timestamp,
      network: "bluesky",
      text: post.data.text,
      replyTo: replyTo(post.data.reply.parent.uri, hydration),
    };
  }
  const view = hydration.views.get(post.id);
  return {
    kind: "post",
    id: post.id,
    url: bskyUrl(post.id),
    publishedAt: post.timestamp,
    network: "bluesky",
    author: view ? personOf(view.author) : TOM,
    text: post.data.text,
    likes: view?.likeCount ?? 0,
  };
}

/**
 * A reply to one of my own posts quotes how that post starts; one to someone
 * else shows who. An image-only post of mine has nothing to quote, so it
 * shows me.
 */
function replyTo(
  uri: string,
  { views, texts }: Hydration,
): ReplyItem["replyTo"] {
  const parent = views.get(uri);
  if (uri.split("/")[2] === DID) {
    const text =
      texts.get(uri) ??
      (parent && app.bsky.feed.post.$matches(parent.record)
        ? parent.record.text
        : undefined);
    if (text?.trim()) {
      return {
        kind: "self",
        quote: truncate(text, QUOTE_LENGTH),
        url: bskyUrl(uri),
      };
    }
  }
  return (
    parent && {
      kind: "person",
      person: personOf(parent.author),
      url: bskyUrl(uri),
    }
  );
}

function threadItem(
  thread: Thread,
  views: ReadonlyMap<string, PostView>,
): ThreadItem {
  const [root] = thread.members;
  const view = views.get(root.id);
  return {
    kind: "thread",
    id: thread.id,
    url: bskyUrl(root.id),
    publishedAt: thread.timestamp,
    network: "bluesky",
    title: threadTitle(thread.data.title, root.data.text),
    text: root.data.text,
    author: view ? personOf(view.author) : TOM,
    postCount: thread.members.length,
    image: view && imageOf(view),
    // Who replied needs the whole thread (getPostThread); not yet.
    participants: [],
    replies: view?.replyCount ?? 0,
    reposts: view?.repostCount ?? 0,
    likes: view?.likeCount ?? 0,
  };
}

/**
 * A like of a post. Likes of anything else (feeds, lists, …) are left out.
 * Without the AppView, or once the post's gone, it's just "Liked a post".
 */
function likeItem(
  like: Like,
  views: ReadonlyMap<string, PostView>,
): LikeItem | undefined {
  const { uri } = like.data.subject;
  if (!isPostUri(uri)) return undefined;
  const view = views.get(uri);
  return {
    kind: "like",
    id: like.id,
    url: bskyUrl(uri),
    publishedAt: like.timestamp,
    network: "bluesky",
    author: view && personOf(view.author),
  };
}

function isPostUri(uri: string) {
  return uri.split("/")[3] === "app.bsky.feed.post";
}

/**
 * No cover art yet: looking it up per play at render time is too many calls
 * to Deezer. It'll come from the activity cache, stored at ingestion.
 */
function trackItem(play: Play): TrackItem {
  const { trackName, artists = [], originUri, releaseName } = play.data;
  const artist = artists.map((a) => a.artistName).join(", ");
  return {
    kind: "track",
    id: play.id,
    url:
      httpUrl(originUri) ??
      lastFmTrackUrl(artists[0]?.artistName ?? "", trackName),
    publishedAt: play.timestamp,
    title: trackName,
    artist,
    art: {
      alt: `${releaseName ?? trackName} cover art`,
      hue: hueOf(artists[0]?.artistName ?? trackName),
    },
  };
}

function gitHubItem(event: GitHubEvent): GitHubEventItem {
  return {
    kind: "github",
    id: event.id,
    publishedAt: event.timestamp,
    ...describe(event),
  };
}

/** What happened, in the style of GitHub's own feed, and where to see it. */
function describe(event: GitHubEvent): { description: string; url: string } {
  const repo = event.data.repo.name;
  const repoUrl = `https://github.com/${repo}`;
  switch (event.type) {
    case "github.PushEvent": {
      const { ref, head } = event.data.payload;
      return {
        description: `Pushed to ${ref.replace(/^refs\/heads\//, "")} on ${repo}`,
        url: `${repoUrl}/commit/${head}`,
      };
    }
    case "github.CreateEvent": {
      const { ref_type, ref } = event.data.payload;
      return ref_type === "repository" || ref === null
        ? { description: `Created ${repo}`, url: repoUrl }
        : {
            description: `Created ${ref_type} ${ref} on ${repo}`,
            url: `${repoUrl}/tree/${ref}`,
          };
    }
    case "github.DeleteEvent": {
      const { ref_type, ref } = event.data.payload;
      return {
        description: `Deleted ${ref_type} ${ref} on ${repo}`,
        url: repoUrl,
      };
    }
    case "github.PullRequestEvent": {
      const { action, number } = event.data.payload;
      return {
        description: `${capitalise(action)} PR #${number} on ${repo}`,
        url: `${repoUrl}/pull/${number}`,
      };
    }
    case "github.PullRequestReviewEvent": {
      const { review, pull_request } = event.data.payload;
      const verb =
        review.state.toLowerCase() === "approved"
          ? "Approved"
          : review.state.toLowerCase() === "changes_requested"
            ? "Requested changes on"
            : "Reviewed";
      return {
        description: `${verb} PR #${pull_request.number} on ${repo}`,
        url: review.html_url,
      };
    }
    case "github.IssuesEvent": {
      const { action, issue } = event.data.payload;
      return {
        description: `${capitalise(action)} issue #${issue.number} on ${repo}: ${issue.title}`,
        url: issue.html_url,
      };
    }
    case "github.IssueCommentEvent": {
      const { issue, comment } = event.data.payload;
      const kind = issue.html_url.includes("/pull/") ? "PR" : "issue";
      return {
        description: `Commented on ${kind} #${issue.number} on ${repo}: ${issue.title}`,
        url: comment.html_url,
      };
    }
    case "github.WatchEvent":
      return { description: `Starred ${repo}`, url: repoUrl };
  }
}

function personOf(profile: PostView["author"]): Person {
  const name = profile.displayName?.trim() || profile.handle;
  return {
    name,
    handle: `@${profile.handle}`,
    // Placeholders tint by person; mine uses the accent.
    avatar: {
      alt: name,
      url: profile.avatar && avatarThumbnail(profile.avatar),
      hue: profile.did === DID ? undefined : hueOf(profile.did),
    },
  };
}

/**
 * The AppView links full-size avatars on Bluesky's CDN; avatars here are at
 * most 34px, so use its thumbnail preset. Anything not on the CDN is dropped
 * rather than hotlinked.
 */
function avatarThumbnail(url: string): string | undefined {
  const prefix = "https://cdn.bsky.app/img/avatar/";
  return url.startsWith(prefix)
    ? `https://cdn.bsky.app/img/avatar_thumbnail/${url.slice(prefix.length)}`
    : undefined;
}

function capitalise(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
