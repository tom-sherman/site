import "server-only";
import { asUnknown$TypedObject, toDatetimeString } from "@atproto/lex";
import { app, is, site } from "@repo/atproto-client";
import { parseAtUri, pdsClient } from "../data/atproto";
import { PUBLICATION, threadRootOf } from "../data/blog";
import { appview, bskyUrl, getPostViews } from "../data/bluesky";
import { DID } from "../data/profile";
import { getThread } from "../data/thread";
import type { Timestamp } from "../data/types";
import { repoClient } from "./session";
import { newTid } from "./tid";

/**
 * Bluesky threads published as writing: a `site.standard.document` in this
 * site's publication whose content points at the thread's first post, as
 * `threadRootOf` reads it. Threads are written on Bluesky; here I only pick
 * which to publish.
 */

/** One of my posts on Bluesky, to pick a thread from. */
export interface MyPost {
  uri: string;
  /** On bsky.app. */
  url: string;
  text: string;
  createdAt: Timestamp;
  replies: number;
  likes: number;
  images: number;
  /** The page it's published as, if it already is. */
  publishedAt?: string;
}

/** A published thread. */
export interface PublishedThread {
  /** The document's rkey. */
  rkey: string;
  /** Its first post's at-uri. */
  root: string;
  title: string;
  path: string;
  publishedAt: Timestamp;
}

/**
 * My posts, newest first, a page at a time from Bluesky's AppView: only
 * ones that start something, so no replies or reposts.
 */
export async function getMyPosts(
  cursor?: string,
): Promise<{ posts: MyPost[]; cursor?: string }> {
  const [feed, threads] = await Promise.all([
    appview.call(app.bsky.feed.getAuthorFeed, {
      actor: DID,
      filter: "posts_no_replies",
      limit: 30,
      cursor,
    }),
    listThreads(),
  ]);
  const published = new Map(threads.map((thread) => [thread.root, thread]));
  const posts = feed.feed.flatMap(({ post, reason }): MyPost[] => {
    const record = app.bsky.feed.post.$safeParse(post.record);
    if (reason || !record.success || record.value.reply) return [];
    return [
      {
        uri: post.uri,
        url: bskyUrl(post.uri),
        text: record.value.text,
        createdAt: Date.parse(record.value.createdAt),
        replies: post.replyCount ?? 0,
        likes: post.likeCount ?? 0,
        images: imageCount(post.embed),
        publishedAt: published.get(post.uri)?.path,
      },
    ];
  });
  return { posts, cursor: feed.cursor };
}

/** The threads already published, newest first. Read fresh, not cached. */
export async function listThreads(): Promise<PublishedThread[]> {
  const client = await pdsClient(DID);
  const threads: PublishedThread[] = [];
  for await (const doc of client.listAll(site.standard.document, {
    repo: DID,
    limit: 100,
  })) {
    if (!doc.valid || doc.value.site !== PUBLICATION) continue;
    const root = threadRootOf(doc.uri, doc.value);
    const rkey = parseAtUri(doc.uri)?.rkey;
    if (!root || !rkey) continue;
    threads.push({
      rkey,
      root,
      title: doc.value.title,
      path: doc.value.path ?? "",
      publishedAt: Date.parse(doc.value.publishedAt),
    });
  }
  return threads.sort((a, b) => b.publishedAt - a.publishedAt);
}

export class ThreadError extends Error {}

/**
 * Publishes the thread starting at `root`, one of my posts. Its date is
 * the first post's, and its text the thread's main line.
 */
export async function publishThread(
  root: string,
  { title, description, tags }: ThreadInput,
): Promise<string> {
  const ref = parseAtUri(root);
  if (ref?.repo !== DID || ref.collection !== app.bsky.feed.post.$nsid) {
    throw new ThreadError("Only my own posts can be published as threads.");
  }
  const [thread, views, existing] = await Promise.all([
    getThread(root),
    getPostViews([root]),
    listThreads(),
  ]);
  const view = views.get(root);
  if (!thread || !view) throw new ThreadError("That post's gone.");
  if (existing.some((published) => published.root === root)) {
    throw new ThreadError("That thread's already published.");
  }

  const rkey = newTid();
  const client = await repoClient();
  await client.create(
    site.standard.document,
    {
      site: PUBLICATION,
      path: `/blog/${rkey}`,
      title,
      description: description || undefined,
      tags: tags.length > 0 ? tags : undefined,
      content: asUnknown$TypedObject(
        is.sherman.unspecced.documentref.$build({ uri: view.uri }),
      ),
      bskyPostRef: { uri: view.uri, cid: view.cid },
      textContent: thread.posts.map((post) => post.text).join("\n\n"),
      publishedAt: toDatetimeString(thread.posts[0].createdAt),
    },
    { rkey },
  );
  return rkey;
}

export interface ThreadInput {
  title: string;
  description: string;
  tags: string[];
}

/** Unpublishes a thread. It stays on Bluesky, of course. */
export async function unpublishThread(rkey: string) {
  // Only threads: blog posts' documents are unpublished with their entries.
  if (!(await listThreads()).some((thread) => thread.rkey === rkey)) {
    throw new ThreadError("That isn't a published thread.");
  }
  const client = await repoClient();
  await client.delete(site.standard.document, { rkey });
}

function imageCount(embed: app.bsky.feed.defs.PostView["embed"]) {
  const { images, recordWithMedia } = app.bsky.embed;
  const media =
    embed && recordWithMedia.view.isTypeOf(embed) ? embed.media : embed;
  return media && images.view.isTypeOf(media) ? media.images.length : 0;
}
