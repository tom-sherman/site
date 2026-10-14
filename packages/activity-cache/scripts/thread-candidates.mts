/**
 * Lists my Bluesky threads that could be published as writing, most posts
 * first. Downloads the whole repo and searches it in memory.
 *
 * A thread is a top-level post of mine and my replies continuing it: each
 * reply's parent is in the thread, so replies to other people, and anything
 * under them, are left out. Only threads of 2 or more posts are listed.
 *
 *   node packages/activity-cache/scripts/thread-candidates.mts [did] [--min=N]
 */
import { MemoryBlockstore, readCarWithRoot, Repo } from "@atproto/repo";

const args = process.argv.slice(2);
const DID =
  args.find((a) => a.startsWith("did:")) ?? "did:plc:2xau7wbgdq4phuou2ypwuen7";
const MIN = Number(args.find((a) => a.startsWith("--min="))?.slice(6) ?? 2);

interface Post {
  uri: string;
  text: string;
  createdAt: string;
  parent?: string;
  root?: string;
}

async function resolvePds(did: string) {
  const url = did.startsWith("did:web:")
    ? `https://${did.slice(8)}/.well-known/did.json`
    : `https://plc.directory/${did}`;
  const doc = (await (await fetch(url)).json()) as {
    service?: { id: string; serviceEndpoint: string }[];
  };
  const pds = doc.service?.find((s) => s.id === "#atproto_pds");
  if (!pds) throw new Error(`No PDS for ${did}`);
  return pds.serviceEndpoint;
}

const pds = await resolvePds(DID);
console.error(`Downloading ${DID}'s repo from ${pds}…`);
const response = await fetch(
  `${pds}/xrpc/com.atproto.sync.getRepo?did=${encodeURIComponent(DID)}`,
);
if (!response.ok) throw new Error(`getRepo: ${response.status}`);
const bytes = new Uint8Array(await response.arrayBuffer());
const car = await readCarWithRoot(bytes);
const repo = await Repo.load(new MemoryBlockstore(car.blocks), car.root);
console.error(`${(bytes.length / 1e6).toFixed(1)}MB`);

const posts = new Map<string, Post>();
for await (const { collection, rkey, record } of repo.walkRecords(
  "app.bsky.feed.post/",
)) {
  if (collection !== "app.bsky.feed.post") break;
  const r = record as {
    text?: string;
    createdAt?: string;
    reply?: { parent?: { uri?: string }; root?: { uri?: string } };
  };
  const uri = `at://${DID}/${collection}/${rkey}`;
  posts.set(uri, {
    uri,
    text: r.text ?? "",
    createdAt: r.createdAt ?? "",
    parent: r.reply?.parent?.uri,
    root: r.reply?.root?.uri,
  });
}

// Threads already published: documents whose content points at a post.
const published = new Set<string>();
for await (const { collection, record } of repo.walkRecords(
  "site.standard.document/",
)) {
  if (collection !== "site.standard.document") break;
  const content = (record as { content?: { $type?: string; uri?: string } })
    .content;
  if (content?.$type === "is.sherman.unspecced.documentref" && content.uri) {
    published.add(content.uri);
  }
}

// My replies, by the post of mine they reply to.
const children = new Map<string, Post[]>();
for (const post of posts.values()) {
  if (!post.parent || !posts.has(post.parent)) continue;
  const siblings = children.get(post.parent) ?? [];
  siblings.push(post);
  children.set(post.parent, siblings);
}

interface Thread {
  root: Post;
  posts: Post[];
  depth: number;
  branches: number;
}

const threads: Thread[] = [];
for (const root of posts.values()) {
  if (root.parent) continue;
  const thread: Post[] = [];
  let depth = 0;
  let branches = 0;
  const visit = (post: Post, level: number) => {
    thread.push(post);
    depth = Math.max(depth, level);
    // Replies that also say they're in this thread; a mismatched root is a
    // quote-reply oddity or a client bug, so it doesn't count.
    const replies = (children.get(post.uri) ?? []).filter(
      (reply) => reply.root === root.uri,
    );
    if (replies.length > 1) branches += replies.length - 1;
    for (const reply of replies) visit(reply, level + 1);
  };
  visit(root, 1);
  if (thread.length >= MIN)
    threads.push({ root, posts: thread, depth, branches });
}

threads.sort(
  (a, b) =>
    b.posts.length - a.posts.length ||
    b.root.createdAt.localeCompare(a.root.createdAt),
);

const oneLine = (text: string, max: number) => {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
};

for (const { root, posts: thread, depth, branches } of threads) {
  const rkey = root.uri.split("/").pop();
  const shape = branches
    ? ` (depth ${depth}, ${branches} branch${branches > 1 ? "es" : ""})`
    : "";
  console.log(
    [
      `${String(thread.length).padStart(3)} posts${shape}${published.has(root.uri) ? "  [published]" : ""}`,
      `    ${root.createdAt.slice(0, 10)}  https://bsky.app/profile/${DID}/post/${rkey}`,
      `    ${root.uri}`,
      `    ${oneLine(root.text, 100) || "(no text)"}`,
    ].join("\n"),
  );
}
console.error(
  `\n${threads.length} threads of ${MIN}+ posts, from ${posts.size} posts.`,
);
