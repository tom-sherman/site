import "server-only";
import { asUnknown$TypedObject, currentDatetimeString } from "@atproto/lex";
import { com, is, site } from "@repo/atproto-client";
import { orNotFound, parseAtUri, pdsClient } from "../data/atproto";
import { PUBLICATION } from "../data/blog";
import { DID } from "../data/profile";
import type { Timestamp } from "../data/types";
import { plainText } from "./markdown";
import { repoClient } from "./session";
import { slugify } from "./slug";

/**
 * Blog posts written here. Each is a WhiteWind entry, which holds the
 * Markdown, drafts included: `visibility` is `author` while it's a draft,
 * so WhiteWind keeps it to itself (though, like everything in a repo, it's
 * public). Publishing makes it `url` and adds a `site.standard.document` in
 * this site's publication, with the same rkey, whose content points at the
 * entry. That's how the posts migrated from WhiteWind were published too,
 * so they're edited here the same way.
 */

type Entry = com.whtwnd.blog.entry.Main;
type Document = site.standard.document.Main;

export interface AdminPost {
  /** The entry's. */
  rkey: string;
  title: string;
  subtitle: string;
  markdown: string;
  createdAt?: Timestamp;
  /** From its document, once it's published. */
  published?: {
    path: string;
    slug: string;
    tags: string[];
    publishedAt: Timestamp;
  };
}

/** What the editor saves. */
export interface PostInput {
  title: string;
  subtitle: string;
  markdown: string;
  /** For the path, once published. Made from the title when it's empty. */
  slug: string;
  tags: string[];
}

/** My entries, newest first, published or not. Read fresh, not cached. */
export async function listPosts(): Promise<AdminPost[]> {
  const client = await pdsClient(DID);
  const [entries, documents] = await Promise.all([
    Array.fromAsync(
      client.listAll(com.whtwnd.blog.entry, { repo: DID, limit: 100 }),
    ),
    documentsByEntry(),
  ]);
  return entries
    .flatMap((entry) => {
      const rkey = parseAtUri(entry.uri)?.rkey;
      if (!entry.valid || !rkey) return [];
      return [toAdminPost(rkey, entry.value, documents.get(rkey))];
    })
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/** The post whose entry has this rkey, or `null`. */
export async function getAdminPost(rkey: string): Promise<AdminPost | null> {
  const found = await findPost(rkey);
  return found && toAdminPost(rkey, found.entry, found.document);
}

/** Saves a new draft, returning its rkey. */
export async function createDraft(input: PostInput): Promise<string> {
  const client = await repoClient();
  const { uri } = await client.create(com.whtwnd.blog.entry, {
    ...entryFields(input),
    createdAt: currentDatetimeString(),
    visibility: "author",
  });
  const rkey = parseAtUri(uri)?.rkey;
  if (!rkey) throw new Error(`Unexpected record URI ${uri}`);
  return rkey;
}

/** Saves a post's changes: its entry, and its document once it's published. */
export async function savePost(rkey: string, input: PostInput) {
  const { entry, document } = await requirePost(rkey);
  const client = await repoClient();
  await client.applyWrites((op) => [
    op.update(
      com.whtwnd.blog.entry,
      { ...withoutType(entry), ...entryFields(input) },
      { rkey },
    ),
    ...(document
      ? [
          op.update(
            site.standard.document,
            documentFields(rkey, document.rkey, input, document.value),
            { rkey: document.rkey },
          ),
        ]
      : []),
  ]);
}

/** Saves a draft's changes and puts it on the blog. */
export async function publishPost(rkey: string, input: PostInput) {
  const { entry, document } = await requirePost(rkey);
  if (document) return savePost(rkey, input);
  const client = await repoClient();
  await client.applyWrites((op) => [
    op.update(
      com.whtwnd.blog.entry,
      { ...withoutType(entry), ...entryFields(input), visibility: "url" },
      { rkey },
    ),
    // The document shares the entry's rkey, as the migrated posts' do.
    op.create(site.standard.document, documentFields(rkey, rkey, input), {
      rkey,
    }),
  ]);
}

/** Saves a post's changes and takes it off the blog, back to a draft. */
export async function unpublishPost(rkey: string, input: PostInput) {
  const { entry, document } = await requirePost(rkey);
  if (!document) return savePost(rkey, input);
  const client = await repoClient();
  await client.applyWrites((op) => [
    op.update(
      com.whtwnd.blog.entry,
      { ...withoutType(entry), ...entryFields(input), visibility: "author" },
      { rkey },
    ),
    op.delete(site.standard.document, { rkey: document.rkey }),
  ]);
}

/** Deletes a post, and its document if it's published. */
export async function deletePost(rkey: string) {
  const { document } = await requirePost(rkey);
  const client = await repoClient();
  await client.applyWrites((op) => [
    op.delete(com.whtwnd.blog.entry, { rkey }),
    ...(document
      ? [op.delete(site.standard.document, { rkey: document.rkey })]
      : []),
  ]);
}

/** `/blog/{slug}-{rkey}`, or `/blog/{rkey}` without a slug. */
export function postPath(rkey: string, slug: string) {
  return `/blog/${slug ? `${slug}-` : ""}${rkey}`;
}

export class PostNotFoundError extends Error {}

async function requirePost(rkey: string) {
  const found = await findPost(rkey);
  if (!found) throw new PostNotFoundError(`No post ${rkey}`);
  return found;
}

/** An entry, and its document if it has one. */
async function findPost(rkey: string) {
  const client = await pdsClient(DID);
  const [entry, documents] = await Promise.all([
    orNotFound(client.get(com.whtwnd.blog.entry, { repo: DID, rkey })),
    documentsByEntry(),
  ]);
  return entry && { entry: entry.value, document: documents.get(rkey) };
}

/**
 * This site's documents that publish one of my entries, by the entry's
 * rkey. Usually they share it, but documents aren't assumed to.
 */
async function documentsByEntry() {
  const client = await pdsClient(DID);
  const documents = new Map<string, { rkey: string; value: Document }>();
  for await (const doc of client.listAll(site.standard.document, {
    repo: DID,
    limit: 100,
  })) {
    if (!doc.valid || doc.value.site !== PUBLICATION) continue;
    const ref = is.sherman.unspecced.documentref.$safeParse(doc.value.content);
    const entry = ref.success ? parseAtUri(ref.value.uri) : null;
    const rkey = parseAtUri(doc.uri)?.rkey;
    if (
      rkey &&
      entry?.repo === DID &&
      entry.collection === com.whtwnd.blog.entry.$nsid
    ) {
      documents.set(entry.rkey, { rkey, value: doc.value });
    }
  }
  return documents;
}

function toAdminPost(
  rkey: string,
  entry: Entry,
  document?: { rkey: string; value: Document },
): AdminPost {
  const path = document?.value.path;
  return {
    rkey,
    title: entry.title ?? "",
    subtitle: entry.subtitle ?? "",
    markdown: entry.content,
    createdAt: entry.createdAt ? Date.parse(entry.createdAt) : undefined,
    published:
      document && path
        ? {
            path,
            // Everything between `/blog/` and `-{rkey}`.
            slug: path
              .slice("/blog/".length, -document.rkey.length)
              .replace(/-$/, ""),
            tags: document.value.tags ?? [],
            publishedAt: Date.parse(document.value.publishedAt),
          }
        : undefined,
  };
}

function entryFields({ title, subtitle, markdown }: PostInput) {
  return {
    title: title || undefined,
    subtitle: subtitle || undefined,
    content: markdown,
  };
}

/**
 * A document for the post, keeping what the editor doesn't change (when it
 * was published, its Bluesky post) from `current`. Its path ends with its
 * own rkey, `documentRkey`.
 */
function documentFields(
  entryRkey: string,
  documentRkey: string,
  input: PostInput,
  current?: Document,
): Omit<Document, "$type"> {
  const now = currentDatetimeString();
  return {
    ...(current && withoutType(current)),
    site: PUBLICATION,
    path: postPath(documentRkey, input.slug || slugify(input.title)),
    title: input.title,
    description: input.subtitle || undefined,
    tags: input.tags.length > 0 ? input.tags : undefined,
    content: asUnknown$TypedObject(
      is.sherman.unspecced.documentref.$build({
        uri: `at://${DID}/${com.whtwnd.blog.entry.$nsid}/${entryRkey}`,
      }),
    ),
    textContent: plainText(input.markdown),
    publishedAt: current?.publishedAt ?? now,
    updatedAt: current ? now : undefined,
  };
}

function withoutType<T extends { $type?: string }>({
  $type: _,
  ...rest
}: T): Omit<T, "$type"> {
  return rest;
}
