import * as stylex from "@stylexjs/stylex";
import type { Metadata } from "next";
import Link from "next/link";
import { listPosts } from "@/lib/admin/posts";
import { getMyPosts } from "@/lib/admin/threads";
import { Eyebrow, Rule, TextLink } from "@/lib/components/Text";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import { formatDate } from "@/lib/time";
import { MyPostGrid } from "../_components/MyPostCard";
import { PageHeading } from "../_components/PageHeading";
import { StartDraftForm } from "./StartDraftForm";

export const metadata: Metadata = { title: "Home" };

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
  drafts: {
    marginTop: 20,
    listStyle: "none",
  },
  draft: {
    display: "grid",
    gridTemplateColumns: "88px minmax(0, 1fr)",
    alignItems: "baseline",
    columnGap: 16,
    paddingBlock: 8,
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
    fontSize: 20,
    lineHeight: 1.2,
  },
  more: {
    marginTop: 16,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
  },
});

/** Quick actions: start writing, or publish one of my latest posts as a thread. */
export default async function AdminHome() {
  const [posts, mine] = await Promise.all([
    listPosts(),
    // Reposts and replies are left out, so ask for more than are shown.
    getMyPosts({ limit: 25 }),
  ]);
  const drafts = posts.filter((post) => !post.published).slice(0, 3);
  return (
    <>
      <PageHeading title="Admin" />
      <section {...stylex.props(styles.section)}>
        <div {...stylex.props(styles.sectionHeading)}>
          <Eyebrow as="h2">Write</Eyebrow>
          <Rule />
        </div>
        <StartDraftForm />
        {drafts.length > 0 && (
          <ol aria-label="Recent drafts" {...stylex.props(styles.drafts)}>
            {drafts.map((draft) => (
              <li key={draft.rkey}>
                <Link
                  href={`/admin/posts/${draft.rkey}`}
                  {...stylex.props(styles.draft)}
                >
                  <span {...stylex.props(styles.date)}>
                    {draft.createdAt ? formatDate(draft.createdAt) : "—"}
                  </span>
                  <span {...stylex.props(styles.title)}>
                    {draft.title || "Untitled"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
        <p {...stylex.props(styles.more)}>
          <TextLink href="/admin/posts">All posts →</TextLink>
        </p>
      </section>
      <section {...stylex.props(styles.section)}>
        <div {...stylex.props(styles.sectionHeading)}>
          <Eyebrow as="h2">Latest on Bluesky</Eyebrow>
          <Rule />
        </div>
        <MyPostGrid posts={mine.posts.slice(0, 5)} />
        <p {...stylex.props(styles.more)}>
          <TextLink href="/admin/threads">More posts →</TextLink>
        </p>
      </section>
    </>
  );
}
