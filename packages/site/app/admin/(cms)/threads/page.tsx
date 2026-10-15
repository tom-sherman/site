import * as stylex from "@stylexjs/stylex";
import type { Metadata } from "next";
import Link from "next/link";
import {
  getMyPosts,
  listThreads,
  type PublishedThread,
} from "@/lib/admin/threads";
import { Eyebrow, Rule, TextLink } from "@/lib/components/Text";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import { formatDate } from "@/lib/time";
import { ConfirmForm } from "../../_components/ConfirmForm";
import { Button } from "../../_components/controls";
import { MyPostGrid } from "../../_components/MyPostCard";
import { PageHeading } from "../../_components/PageHeading";
import { unpublishThreadAction } from "./actions";

export const metadata: Metadata = { title: "Threads" };

const styles = stylex.create({
  section: {
    marginBottom: 56,
  },
  sectionHeading: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  count: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  intro: {
    maxWidth: "60ch",
    marginBottom: 20,
    fontSize: fontSizes.body,
    lineHeight: 1.5,
    color: colors.body,
  },
  list: {
    listStyle: "none",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "88px minmax(0, 1fr) auto",
    alignItems: "baseline",
    columnGap: 16,
    paddingBlock: 12,
    borderBottomWidth: 1,
    borderBottomStyle: "dashed",
    borderBottomColor: colors.rule,
  },
  date: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 22,
    lineHeight: 1.15,
    color: "inherit",
    textDecoration: "none",
  },
  more: {
    marginTop: 24,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
  },
  empty: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    color: colors.muted,
  },
});

export default async function ThreadsPage({
  searchParams,
}: PageProps<"/admin/threads">) {
  const { cursor } = await searchParams;
  const [threads, mine] = await Promise.all([
    listThreads(),
    getMyPosts({ cursor: typeof cursor === "string" ? cursor : undefined }),
  ]);
  return (
    <>
      <PageHeading title="Threads" />
      {!cursor && <Published threads={threads} />}
      <section>
        <div {...stylex.props(styles.sectionHeading)}>
          <Eyebrow as="h2">{cursor ? "Older posts" : "My posts"}</Eyebrow>
          <Rule />
        </div>
        <p {...stylex.props(styles.intro)}>
          Pick the first post of a thread to publish it on the blog. It&apos;s
          read from Bluesky, so it keeps up with replies I add later.
        </p>
        {mine.posts.length > 0 ? (
          <MyPostGrid posts={mine.posts} />
        ) : (
          <p {...stylex.props(styles.empty)}>No more posts.</p>
        )}
        {mine.cursor && (
          <p {...stylex.props(styles.more)}>
            <TextLink
              href={`/admin/threads?cursor=${encodeURIComponent(mine.cursor)}`}
            >
              Older posts →
            </TextLink>
          </p>
        )}
      </section>
    </>
  );
}

function Published({ threads }: { threads: PublishedThread[] }) {
  return (
    <section {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.sectionHeading)}>
        <Eyebrow as="h2">Published</Eyebrow>
        <Rule />
        <span {...stylex.props(styles.count)}>{threads.length}</span>
      </div>
      {threads.length === 0 ? (
        <p {...stylex.props(styles.empty)}>None yet.</p>
      ) : (
        <ol {...stylex.props(styles.list)}>
          {threads.map((thread) => (
            <li key={thread.rkey} {...stylex.props(styles.row)}>
              <span {...stylex.props(styles.date)}>
                {formatDate(thread.publishedAt)}
              </span>
              <Link href={thread.path} {...stylex.props(styles.title)}>
                {thread.title}
              </Link>
              <ConfirmForm
                action={unpublishThreadAction}
                message={`Unpublish “${thread.title}”? It stays on Bluesky.`}
              >
                <input type="hidden" name="rkey" value={thread.rkey} />
                <Button type="submit" variant="danger">
                  Unpublish
                </Button>
              </ConfirmForm>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
