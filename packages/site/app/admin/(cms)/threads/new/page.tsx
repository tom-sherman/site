import * as stylex from "@stylexjs/stylex";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TextLink } from "@/lib/components/Text";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import { bskyUrl } from "@/lib/data/bluesky";
import { getThread } from "@/lib/data/thread";
import { truncate } from "@/lib/data/util";
import { formatLongDate } from "@/lib/time";
import { PageHeading } from "../../../_components/PageHeading";
import { PublishThreadForm } from "./PublishThreadForm";

export const metadata: Metadata = { title: "Publish a thread" };

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
    alignItems: "start",
    gap: 48,
  },
  meta: {
    marginBottom: 16,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    color: colors.muted,
  },
  posts: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    paddingInlineStart: 24,
    fontSize: fontSizes.body,
    lineHeight: 1.5,
    color: colors.body,
  },
  post: {
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
});

/** A thread, as it'd be published, and what to call it. */
export default async function NewThreadPage({
  searchParams,
}: PageProps<"/admin/threads/new">) {
  const { root } = await searchParams;
  if (typeof root !== "string") notFound();
  const thread = await getThread(root).catch(() => null);
  if (!thread) notFound();
  const [first] = thread.posts;
  return (
    <>
      <PageHeading title="Publish a thread" />
      <div {...stylex.props(styles.layout)}>
        <PublishThreadForm
          root={root}
          suggestedTitle={truncate(first.text, 80)}
        />
        <section aria-label="The thread">
          <p {...stylex.props(styles.meta)}>
            {thread.posts.length} {thread.posts.length === 1 ? "post" : "posts"}
            {thread.forks.length > 0 &&
              `, and ${thread.forks.length} ${thread.forks.length === 1 ? "branch" : "branches"} as footnotes`}
            , from {formatLongDate(first.createdAt)} ·{" "}
            <TextLink href={bskyUrl(root)}>On Bluesky</TextLink>
          </p>
          <ol {...stylex.props(styles.posts)}>
            {thread.posts.map((post) => (
              <li key={post.uri} {...stylex.props(styles.post)}>
                {post.text}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
