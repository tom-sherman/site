import * as stylex from "@stylexjs/stylex";
import { Artwork } from "@/lib/components/Artwork";
import { Avatar, AvatarStack } from "@/lib/components/Avatar";
import { Card, CardHeader } from "@/lib/components/Card";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import type { BlogPostItem, FilmReviewItem, ThreadItem } from "@/lib/data/feed";
import {
  formatCount,
  formatStars,
  glyphOf,
  labelOf,
  type HighPriorityItem,
} from "@/lib/feed";

const styles = stylex.create({
  card: {
    marginTop: 8,
    marginBottom: 44,
  },
  hero: {
    aspectRatio: "16 / 7",
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.rule,
  },
  blogBody: {
    paddingTop: 22,
    paddingInline: 24,
    paddingBottom: 28,
  },
  blogTitle: {
    fontFamily: fonts.serif,
    fontSize: "clamp(28px, 3.4vw, 38px)",
    fontWeight: 400,
    lineHeight: 1,
    letterSpacing: "-0.01em",
    textWrap: "pretty",
  },
  excerpt: {
    marginTop: 12,
    maxWidth: "62ch",
    fontSize: fontSizes.body,
    lineHeight: 1.5,
    color: colors.body,
    textWrap: "pretty",
  },
  threadBody: {
    paddingTop: 22,
    paddingInline: 24,
    paddingBottom: 24,
  },
  author: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  authorText: {
    display: "flex",
    flexDirection: "column",
  },
  authorName: {
    fontSize: 14.5,
    fontWeight: 600,
  },
  handle: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  threadText: {
    marginTop: 14,
    maxWidth: "56ch",
    fontSize: 18,
    lineHeight: 1.45,
    textWrap: "pretty",
  },
  attachment: {
    marginTop: 14,
    aspectRatio: "16 / 8",
    paddingBlock: 10,
    paddingInline: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.rule,
  },
  threadFooter: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  stats: {
    marginLeft: 6,
  },
  reviewBody: {
    display: "grid",
    gridTemplateColumns: "clamp(84px, 18%, 120px) minmax(0, 1fr)",
    gap: 24,
    padding: 24,
  },
  poster: {
    aspectRatio: "2 / 3",
  },
  reviewMain: {
    minWidth: 0,
  },
  reviewHeading: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    rowGap: 4,
    columnGap: 10,
  },
  reviewTitle: {
    fontFamily: fonts.serif,
    fontSize: "clamp(30px, 3.4vw, 40px)",
    fontWeight: 400,
    lineHeight: 1,
  },
  year: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    color: colors.muted,
  },
  stars: {
    marginTop: 8,
    fontSize: 18,
    letterSpacing: "0.08em",
  },
  reviewExcerpt: {
    marginTop: 10,
    maxWidth: "58ch",
  },
});

/** High-priority items are the only ones rendered as cards, and the only ones with media. */
export function HighCard({ item }: { item: HighPriorityItem }) {
  return (
    <Card href={item.url} style={styles.card}>
      <CardHeader
        glyph={glyphOf(item)}
        label={labelOf(item)}
        meta={metaOf(item)}
      />
      {item.kind === "blog-post" && <BlogPostBody item={item} />}
      {item.kind === "thread" && <ThreadBody item={item} />}
      {item.kind === "film-review" && <FilmReviewBody item={item} />}
    </Card>
  );
}

function metaOf(item: HighPriorityItem) {
  switch (item.kind) {
    case "blog-post":
      return `${item.readingMinutes} min read`;
    case "thread":
      return `1/${item.postCount}`;
    case "film-review":
      return "Letterboxd";
  }
}

function BlogPostBody({ item }: { item: BlogPostItem }) {
  return (
    <>
      <Artwork
        image={item.hero}
        variant="photo"
        caption={item.hero.alt}
        style={styles.hero}
      />
      <div {...stylex.props(styles.blogBody)}>
        <h3 {...stylex.props(styles.blogTitle)}>{item.title}</h3>
        <p {...stylex.props(styles.excerpt)}>{item.excerpt}</p>
      </div>
    </>
  );
}

function ThreadBody({ item }: { item: ThreadItem }) {
  return (
    <div {...stylex.props(styles.threadBody)}>
      <div {...stylex.props(styles.author)}>
        <Avatar name={item.author.name} image={item.author.avatar} size="lg" />
        <span {...stylex.props(styles.authorText)}>
          <span {...stylex.props(styles.authorName)}>{item.author.name}</span>
          <span {...stylex.props(styles.handle)}>{item.author.handle}</span>
        </span>
      </div>
      <p {...stylex.props(styles.threadText)}>{item.text}</p>
      {item.image && (
        <Artwork
          image={item.image}
          variant="photo"
          caption={item.image.alt}
          style={styles.attachment}
        />
      )}
      <div {...stylex.props(styles.threadFooter)}>
        <AvatarStack people={item.participants} />
        <span {...stylex.props(styles.stats)}>
          {formatCount(item.replies)} replies · {formatCount(item.reposts)}{" "}
          reposts · {formatCount(item.likes)} likes
        </span>
      </div>
    </div>
  );
}

function FilmReviewBody({ item }: { item: FilmReviewItem }) {
  return (
    <div {...stylex.props(styles.reviewBody)}>
      <Artwork
        image={item.poster}
        variant="poster"
        caption="poster"
        style={styles.poster}
      />
      <div {...stylex.props(styles.reviewMain)}>
        <div {...stylex.props(styles.reviewHeading)}>
          <h3 {...stylex.props(styles.reviewTitle)}>{item.title}</h3>
          <span {...stylex.props(styles.year)}>{item.year}</span>
        </div>
        <div
          aria-label={`${item.rating} out of 5 stars`}
          {...stylex.props(styles.stars)}
        >
          {formatStars(item.rating)}
        </div>
        <p {...stylex.props(styles.excerpt, styles.reviewExcerpt)}>
          {item.excerpt}
        </p>
      </div>
    </div>
  );
}
