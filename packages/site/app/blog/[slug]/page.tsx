import * as stylex from "@stylexjs/stylex";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Container } from "@/lib/components/Container";
import { Glyph } from "@/lib/components/Glyph";
import { TextLink } from "@/lib/components/Text";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import { getBlog, getPost, type Post, rkeyOf } from "@/lib/data/blog";
import { bskyUrl } from "@/lib/data/bluesky";
import { getProfile } from "@/lib/data/profile";
import { formatDateTime, formatLongDate } from "@/lib/time";
import { Breadcrumb } from "../../_components/Breadcrumb";
import { Footer } from "../../_components/Footer";
import { Title } from "../_components/Title";
import { LeafletContent } from "../_components/Leaflet";
import { Markdown } from "../_components/Markdown";

const styles = stylex.create({
  top: {
    paddingTop: 72,
  },
  main: {
    paddingTop: 72,
    paddingBottom: 112,
  },
  // A reading column, narrower than the page's.
  column: {
    maxWidth: 720,
  },
  meta: {
    display: "flex",
    flexWrap: "wrap",
    columnGap: 8,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    color: colors.muted,
  },
  title: {
    marginTop: 20,
    fontFamily: fonts.serif,
    fontSize: "clamp(44px, 7vw, 76px)",
    fontWeight: 400,
    lineHeight: 1,
    letterSpacing: "-0.015em",
    color: colors.ink,
    textWrap: "balance",
  },
  description: {
    marginTop: 20,
    fontSize: "clamp(19px, 2.1vw, 22px)",
    lineHeight: 1.4,
    color: colors.body,
    textWrap: "pretty",
  },
  tags: {
    display: "flex",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 4,
    marginTop: 20,
    listStyle: "none",
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  body: {
    marginTop: 48,
  },
  unsupported: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    color: colors.muted,
  },
  end: {
    display: "flex",
    flexWrap: "wrap",
    columnGap: 24,
    rowGap: 8,
    marginTop: 64,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.rule,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
  },
});

/** Every post, so they're all prerendered. Posts added since are rendered on first request. */
export async function generateStaticParams() {
  const { posts } = await getBlog();
  return posts.map((post) => ({ slug: post.path.slice("/blog/".length) }));
}

/** The post at `/blog/{slug}-{rkey}`; the slug is only for people, so it's matched by rkey. */
async function postFor(slug: string) {
  const rkey = rkeyOf(slug);
  return rkey ? getPost(rkey) : null;
}

export async function generateMetadata({
  params,
}: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const post = await postFor((await params).slug);
  if (!post) return {};
  return {
    title: `${post.title.replaceAll("`", "")} – Tom Sherman`,
    description: post.description,
    authors: { name: "Tom Sherman", url: "https://tom.sherman.is" },
    keywords: post.tags,
    alternates: { canonical: post.canonicalUrl },
    openGraph: {
      type: "article",
      title: post.title.replaceAll("`", ""),
      description: post.description,
      url: post.canonicalUrl,
      publishedTime: new Date(post.publishedAt).toISOString(),
      tags: post.tags,
    },
  };
}

export default async function BlogPostPage({
  params,
}: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const [profile, post, { asOf }] = await Promise.all([
    getProfile(),
    postFor(slug),
    getBlog(),
  ]);
  if (!post) notFound();
  // An old or mistyped slug: the rkey matched, so send it to the current one.
  if (post.path !== `/blog/${slug}`) permanentRedirect(post.path);

  return (
    <>
      {/* Lets standard.site readers verify the document is this page. */}
      {post.ownPublication && (
        <link rel="site.standard.document" href={post.id} />
      )}
      <Container style={styles.top}>
        <Breadcrumb
          domain={profile.domain}
          trail={[{ label: "blog", href: "/blog" }, { label: slug }]}
        />
      </Container>
      <Container as="main" style={styles.main}>
        <article {...stylex.props(styles.column)}>
          <header>
            <p {...stylex.props(styles.meta)}>
              <time
                dateTime={new Date(post.publishedAt).toISOString()}
                title={formatDateTime(post.publishedAt)}
              >
                {formatLongDate(post.publishedAt)}
              </time>
              <span aria-hidden>·</span>
              <span>{post.readingMinutes} min read</span>
            </p>
            <h1 {...stylex.props(styles.title)}>
              <Title text={post.title} />
            </h1>
            {post.description && (
              <p {...stylex.props(styles.description)}>{post.description}</p>
            )}
            {post.tags.length > 0 && (
              <ul aria-label="Tags" {...stylex.props(styles.tags)}>
                {post.tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            )}
          </header>
          <div {...stylex.props(styles.body)}>
            <PostBody post={post} />
          </div>
          <footer {...stylex.props(styles.end)}>
            <TextLink href="/blog">← All posts</TextLink>
            {post.bskyPostUri && (
              <TextLink href={bskyUrl(post.bskyPostUri)}>
                Discuss on Bluesky <Glyph name="external" />
              </TextLink>
            )}
            {!post.ownPublication && (
              <TextLink href={post.canonicalUrl}>
                Originally on Leaflet <Glyph name="external" />
              </TextLink>
            )}
          </footer>
        </article>
      </Container>
      <Footer name={profile.person.name} year={new Date(asOf).getFullYear()} />
    </>
  );
}

function PostBody({ post }: { post: Post }) {
  switch (post.body.format) {
    case "markdown":
      return <Markdown content={post.body.markdown} />;
    case "leaflet":
      return <LeafletContent did={post.body.did} pages={post.body.pages} />;
    case "unsupported":
      return (
        <p {...stylex.props(styles.unsupported)}>
          This post is in a format the site can&apos;t show yet.{" "}
          {!post.ownPublication && (
            <TextLink href={post.canonicalUrl}>Read it on Leaflet</TextLink>
          )}
        </p>
      );
  }
}
