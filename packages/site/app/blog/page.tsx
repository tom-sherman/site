import * as stylex from "@stylexjs/stylex";
import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/lib/components/Container";
import { Glyph } from "@/lib/components/Glyph";
import { Eyebrow, Rule } from "@/lib/components/Text";
import {
  breakpoints,
  colors,
  fonts,
  fontSizes,
} from "@/lib/components/tokens.stylex";
import { type BlogPost, getBlog } from "@/lib/data/blog";
import { getProfile } from "@/lib/data/profile";
import { formatDateTime, formatShortDate, formatYear } from "@/lib/time";
import { Footer } from "../_components/Footer";
import { Header } from "../_components/Header";
import { Title } from "./_components/Title";

export const metadata: Metadata = {
  title: "Blog – Tom Sherman",
  description: "Writing by Tom Sherman, mostly about the web and TypeScript.",
  alternates: {
    types: { "application/rss+xml": "https://tom.sherman.is/blog/rss.xml" },
  },
};

const styles = stylex.create({
  main: {
    paddingBottom: 112,
  },
  // A reading column, narrower than the page's.
  column: {
    maxWidth: 820,
  },
  year: {
    marginTop: 56,
  },
  firstYear: {
    marginTop: 0,
  },
  yearHeading: {
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
  post: {
    display: "grid",
    gridTemplateColumns: {
      default: "56px minmax(0, 1fr)",
      [breakpoints.phone]: "minmax(0, 1fr)",
    },
    alignItems: "baseline",
    rowGap: 6,
    columnGap: 24,
    paddingBlock: 20,
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
    fontSize: "clamp(24px, 3vw, 30px)",
    fontWeight: 400,
    lineHeight: 1.1,
    textWrap: "pretty",
    textDecorationLine: {
      default: "none",
      [stylex.when.ancestor(":hover")]: "underline",
    },
    textDecorationThickness: 1,
    textUnderlineOffset: 4,
  },
  description: {
    marginTop: 8,
    maxWidth: "60ch",
    fontSize: fontSizes.body,
    lineHeight: 1.45,
    color: colors.body,
  },
  // Like a chip, but not a control: it says what kind of post it is.
  kind: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingBlock: 2,
    paddingInline: 7,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.chipBorder,
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.ink,
  },
  tags: {
    display: "flex",
    flexWrap: "wrap",
    columnGap: 12,
    rowGap: 4,
    marginTop: 10,
    listStyle: "none",
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  empty: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    color: colors.muted,
  },
});

export default async function BlogPage() {
  const [profile, { posts, asOf }] = await Promise.all([
    getProfile(),
    getBlog(),
  ]);
  const years = Map.groupBy(posts, (post) => formatYear(post.publishedAt));

  return (
    <>
      <Header profile={profile} page="blog" />
      <Container as="main" style={styles.main}>
        <div {...stylex.props(styles.column)}>
          {posts.length === 0 && (
            <p {...stylex.props(styles.empty)}>Nothing here yet.</p>
          )}
          {[...years].map(([year, yearPosts], i) => (
            <section
              key={year}
              aria-labelledby={`year-${year}`}
              {...stylex.props(styles.year, i === 0 && styles.firstYear)}
            >
              <div {...stylex.props(styles.yearHeading)}>
                <Eyebrow as="h2">
                  <span id={`year-${year}`}>{year}</span>
                </Eyebrow>
                <Rule />
                <span {...stylex.props(styles.count)}>
                  {yearPosts.length} {yearPosts.length === 1 ? "post" : "posts"}
                </span>
              </div>
              <ol {...stylex.props(styles.list)}>
                {yearPosts.map((post) => (
                  <li key={post.id}>
                    <PostRow post={post} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </Container>
      <Footer name={profile.person.name} year={new Date(asOf).getFullYear()} />
    </>
  );
}

function PostRow({ post }: { post: BlogPost }) {
  return (
    <Link
      href={post.path}
      {...stylex.props(styles.post, stylex.defaultMarker())}
    >
      <time
        dateTime={new Date(post.publishedAt).toISOString()}
        title={formatDateTime(post.publishedAt)}
        {...stylex.props(styles.date)}
      >
        {formatShortDate(post.publishedAt)}
      </time>
      <div>
        <h3 {...stylex.props(styles.title)}>
          <Title text={post.title} />
        </h3>
        {post.kind === "thread" && (
          <div>
            <span {...stylex.props(styles.kind)}>
              <Glyph name="bluesky" /> Thread
            </span>
          </div>
        )}
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
      </div>
    </Link>
  );
}
