import "server-only";
import type { l } from "@atproto/lex";
import { app } from "@repo/atproto-client";
import { appview, bskyUrl, type PostView } from "./bluesky";
import type { Facet, PostImage, Timestamp } from "./types";

/** A thread published as writing. */
export interface Thread {
  /** The thread's main line, in order. Never empty. */
  posts: ThreadPost[];
  /** Where I branched off the main line later, numbered from 1 in order. */
  forks: ThreadFork[];
}

/**
 * A later branch off the thread's main line: the reply that started it and
 * anything under it, oldest first. Shown as a footnote to the post it
 * replies to.
 */
export interface ThreadFork {
  number: number;
  posts: ThreadPost[];
}

/** One post in a thread published as writing. */
export interface ThreadPost {
  uri: string;
  /** On bsky.app. */
  url: string;
  text: string;
  facets?: Facet[];
  createdAt: Timestamp;
  images: PostImage[];
  video?: { alt: string; thumbnail?: string };
  external?: {
    uri: string;
    title: string;
    description: string;
    thumb?: string;
  };
  /** A quoted post's at-uri. */
  quote?: string;
  replies: number;
  reposts: number;
  likes: number;
  quotes: number;
  /** The numbers of the forks that branch off it. */
  forks: number[];
}

const { threadViewPost } = app.bsky.feed.defs;
type ThreadViewPost = app.bsky.feed.defs.ThreadViewPost;

/**
 * A thread on Bluesky: its first post and the author's replies continuing
 * it. A reply only counts when its parent is in the thread, so the author's
 * answers to other people (and anything under them) are left out.
 *
 * Where the author replied to one post more than once, the earliest reply
 * carries the main line on and the later ones are forks: usually an
 * afterthought, added once the thread was written. `null` when the first
 * post is gone.
 */
export async function getThread(rootUri: string): Promise<Thread | null> {
  const { thread } = await appview.call(app.bsky.feed.getPostThread, {
    uri: rootUri as l.AtUriString,
    depth: 1000,
    parentHeight: 0,
  });
  if (!threadViewPost.isTypeOf(thread)) return null;

  const author = thread.post.author.did;
  const repliesTo = (node: ThreadViewPost) =>
    (node.replies ?? [])
      .filter(
        (reply): reply is l.$Typed<ThreadViewPost> =>
          threadViewPost.isTypeOf(reply) && reply.post.author.did === author,
      )
      .toSorted((a, b) => createdAt(a.post) - createdAt(b.post));
  // A fork reads as one chain, branches of its own included, oldest first.
  const chain = (node: ThreadViewPost): ThreadPost[] => [
    toThreadPost(node.post),
    ...repliesTo(node).flatMap(chain),
  ];

  const posts: ThreadPost[] = [];
  const forks: ThreadFork[] = [];
  for (
    let node: ThreadViewPost | undefined = thread;
    node;
    node = repliesTo(node)[0]
  ) {
    const post = toThreadPost(node.post);
    for (const fork of repliesTo(node).slice(1)) {
      const number = forks.length + 1;
      forks.push({ number, posts: chain(fork) });
      post.forks.push(number);
    }
    posts.push(post);
  }
  return { posts, forks };
}

function toThreadPost(view: PostView): ThreadPost {
  const record = app.bsky.feed.post.$safeParse(view.record);
  return {
    uri: view.uri,
    url: bskyUrl(view.uri),
    text: record.success ? record.value.text : "",
    facets: record.success ? record.value.facets : undefined,
    createdAt: createdAt(view),
    ...embedOf(view.embed),
    replies: view.replyCount ?? 0,
    reposts: view.repostCount ?? 0,
    likes: view.likeCount ?? 0,
    quotes: view.quoteCount ?? 0,
    forks: [],
  };
}

/** When the post says it was written, or else when the AppView saw it. */
function createdAt(view: PostView): Timestamp {
  const { createdAt } = view.record as { createdAt?: unknown };
  return (
    (typeof createdAt === "string" && Date.parse(createdAt)) ||
    Date.parse(view.indexedAt)
  );
}

/** What a post embeds, from the AppView's hydrated view of it. */
function embedOf(
  embed: PostView["embed"],
): Pick<ThreadPost, "images" | "video" | "external" | "quote"> {
  const { images, gallery, video, external, record, recordWithMedia } =
    app.bsky.embed;
  if (!embed) return { images: [] };
  const [media, quoted] = recordWithMedia.view.isTypeOf(embed)
    ? [embed.media, embed.record]
    : record.view.isTypeOf(embed)
      ? [undefined, embed]
      : [embed, undefined];
  const quote =
    quoted && record.viewRecord.isTypeOf(quoted.record)
      ? quoted.record.uri
      : undefined;

  if (!media) return { images: [], quote };
  if (images.view.isTypeOf(media)) {
    return {
      images: media.images.map(({ alt, thumb, fullsize }) => ({
        alt,
        thumb,
        fullsize,
      })),
      quote,
    };
  }
  if (gallery.view.isTypeOf(media)) {
    return {
      images: media.items
        .filter((item) => gallery.viewImage.isTypeOf(item))
        .map(({ alt, thumbnail, fullsize }) => ({
          alt,
          thumb: thumbnail,
          fullsize,
        })),
      quote,
    };
  }
  if (video.view.isTypeOf(media)) {
    return {
      images: [],
      video: { alt: media.alt ?? "", thumbnail: media.thumbnail },
      quote,
    };
  }
  if (external.view.isTypeOf(media)) {
    const { uri, title, description, thumb } = media.external;
    return { images: [], external: { uri, title, description, thumb }, quote };
  }
  return { images: [], quote };
}
