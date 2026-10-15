import * as stylex from "@stylexjs/stylex";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminPost } from "@/lib/admin/posts";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import { Markdown } from "@/app/blog/_components/Markdown";
import { Title } from "@/app/blog/_components/Title";

export const metadata: Metadata = { title: "Preview" };

const styles = stylex.create({
  column: {
    maxWidth: 720,
  },
  note: {
    marginBottom: 32,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    color: colors.muted,
  },
  // As on the post's page.
  title: {
    fontFamily: fonts.serif,
    fontSize: "clamp(44px, 7vw, 76px)",
    fontWeight: 400,
    lineHeight: 1,
    letterSpacing: "-0.015em",
    color: colors.ink,
    textWrap: "balance",
  },
  subtitle: {
    marginTop: 20,
    fontSize: "clamp(19px, 2.1vw, 22px)",
    lineHeight: 1.4,
    color: colors.body,
    textWrap: "pretty",
  },
  body: {
    marginTop: 48,
  },
});

/** The saved version of a post, rendered as the blog renders it. */
export default async function PreviewPostPage({
  params,
}: PageProps<"/admin/posts/[rkey]/preview">) {
  const post = await getAdminPost((await params).rkey);
  if (!post) notFound();
  return (
    <article {...stylex.props(styles.column)}>
      <p {...stylex.props(styles.note)}>
        Preview of what&apos;s saved
        {post.published ? "" : ". It's a draft, so it isn't on the blog yet"}.
      </p>
      <h1 {...stylex.props(styles.title)}>
        <Title text={post.title || "Untitled"} />
      </h1>
      {post.subtitle && (
        <p {...stylex.props(styles.subtitle)}>{post.subtitle}</p>
      )}
      <div {...stylex.props(styles.body)}>
        <Markdown content={post.markdown} />
      </div>
    </article>
  );
}
