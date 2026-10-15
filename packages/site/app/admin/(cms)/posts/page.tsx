import * as stylex from "@stylexjs/stylex";
import type { Metadata } from "next";
import Link from "next/link";
import { type AdminPost, listPosts } from "@/lib/admin/posts";
import { Eyebrow, Rule } from "@/lib/components/Text";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import { formatDate } from "@/lib/time";
import { ButtonLink } from "../../_components/controls";
import { PageHeading } from "../../_components/PageHeading";

export const metadata: Metadata = { title: "Posts" };

const styles = stylex.create({
  section: {
    marginBottom: 48,
  },
  sectionHeading: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  count: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  list: {
    listStyle: "none",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "88px minmax(0, 1fr)",
    alignItems: "baseline",
    columnGap: 16,
    paddingBlock: 14,
    color: "inherit",
    textDecoration: "none",
    borderBottomWidth: 1,
    borderBottomStyle: "dashed",
    borderBottomColor: colors.rule,
    backgroundColor: {
      default: null,
      ":hover": colors.hoverTint,
    },
  },
  date: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 24,
    lineHeight: 1.15,
  },
  untitled: {
    color: colors.muted,
    fontStyle: "italic",
  },
  meta: {
    marginTop: 4,
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
    overflowWrap: "anywhere",
  },
  empty: {
    paddingBlock: 14,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    color: colors.muted,
  },
});

export default async function PostsPage() {
  const posts = await listPosts();
  const drafts = posts.filter((post) => !post.published);
  const published = posts
    .filter((post) => post.published)
    .sort((a, b) => b.published!.publishedAt - a.published!.publishedAt);
  return (
    <>
      <PageHeading title="Posts">
        <ButtonLink href="/admin/posts/new" variant="primary">
          New post
        </ButtonLink>
      </PageHeading>
      <Section title="Drafts" posts={drafts} />
      <Section title="Published" posts={published} />
    </>
  );
}

function Section({ title, posts }: { title: string; posts: AdminPost[] }) {
  return (
    <section {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.sectionHeading)}>
        <Eyebrow as="h2">{title}</Eyebrow>
        <Rule />
        <span {...stylex.props(styles.count)}>{posts.length}</span>
      </div>
      {posts.length === 0 ? (
        <p {...stylex.props(styles.empty)}>None.</p>
      ) : (
        <ol {...stylex.props(styles.list)}>
          {posts.map((post) => (
            <li key={post.rkey}>
              <PostRow post={post} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function PostRow({ post }: { post: AdminPost }) {
  const date = post.published?.publishedAt ?? post.createdAt;
  return (
    <Link href={`/admin/posts/${post.rkey}`} {...stylex.props(styles.row)}>
      <span {...stylex.props(styles.date)}>
        {date ? formatDate(date) : "—"}
      </span>
      <div>
        <h3 {...stylex.props(styles.title, !post.title && styles.untitled)}>
          {post.title || "Untitled"}
        </h3>
        <p {...stylex.props(styles.meta)}>
          {post.published?.path ?? `${wordCount(post.markdown)} words`}
        </p>
      </div>
    </Link>
  );
}

function wordCount(markdown: string) {
  return markdown.split(/\s+/).filter(Boolean).length;
}
