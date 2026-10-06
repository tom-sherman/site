import * as stylex from "@stylexjs/stylex";
import x from "@stylexjs/atoms";
import { Artwork } from "@/lib/components/Artwork";
import { Card } from "@/lib/components/Card";
import { RelativeTime } from "@/lib/components/RelativeTime";
import { Eyebrow, Rule, Tag } from "@/lib/components/Text";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import type { Timestamp } from "@/lib/data/types";
import { GLYPHS, glyphOf, labelOf, type HighPriorityItem } from "@/lib/feed";

const styles = stylex.create({
  heading: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  headingText: {
    fontSize: "inherit",
    fontWeight: "inherit",
  },
  latest: {
    color: colors.muted,
  },
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
    gap: 16,
  },
  media: {
    aspectRatio: "16 / 8",
    paddingBlock: 8,
    paddingInline: 8,
    fontSize: 10,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.rule,
  },
  cardBody: {
    paddingTop: 14,
    paddingInline: 16,
    paddingBottom: 18,
  },
  cardMeta: {
    display: "flex",
    gap: 8,
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  ink: {
    color: colors.ink,
  },
  time: {
    marginLeft: "auto",
  },
  cardTitle: {
    marginTop: 8,
    fontFamily: fonts.serif,
    fontSize: 25,
    fontWeight: 400,
    lineHeight: 1.05,
    textWrap: "pretty",
  },
  moreList: {
    marginTop: 6,
    listStyle: "none",
  },
  moreItem: {
    display: "grid",
    gridTemplateColumns: "20px minmax(0, 1fr) auto",
    alignItems: "baseline",
    gap: 8,
    paddingBlock: 9,
    color: "inherit",
    textDecoration: "none",
    backgroundColor: {
      default: null,
      ":hover": colors.hoverTint,
    },
    borderBottomWidth: 1,
    borderBottomStyle: "dashed",
    borderBottomColor: colors.rule,
  },
  moreGlyph: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
  },
  moreTitle: {
    fontSize: 14.5,
    lineHeight: 1.3,
  },
  moreTime: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
});

/**
 * Keeps the latest high-priority items in view. A shortcut, not a move: the
 * same items also appear in the feed.
 */
export function PinnedRail({
  items,
  asOf,
}: {
  /** High-priority items, newest first. */
  items: HighPriorityItem[];
  asOf: Timestamp;
}) {
  const pinned = items.slice(0, 2);
  const more = items.slice(2);

  return (
    <aside aria-labelledby="pinned-heading">
      <div {...stylex.props(styles.heading)}>
        <h2 id="pinned-heading" {...stylex.props(styles.headingText)}>
          <Tag>{GLYPHS.pinned} Pinned</Tag>
        </h2>
        <Rule />
        <span {...stylex.props(styles.latest)}>latest</span>
      </div>

      <div {...stylex.props(styles.cards)}>
        {pinned.map((item) => (
          <Card key={item.id} href={item.url}>
            <PinnedMedia item={item} />
            <div {...stylex.props(styles.cardBody)}>
              <div {...stylex.props(styles.cardMeta)}>
                <span {...stylex.props(styles.ink)}>
                  {glyphOf(item)} {labelOf(item)}
                </span>
                <span {...stylex.props(styles.time)}>
                  <RelativeTime timestamp={item.publishedAt} asOf={asOf} />
                </span>
              </div>
              <h3 {...stylex.props(styles.cardTitle)}>{item.title}</h3>
            </div>
          </Card>
        ))}
      </div>

      {more.length > 0 && (
        <>
          <Eyebrow
            as="h3"
            tone="muted"
            style={[x.display.block, x.marginTop._36px]}
          >
            More highlights
          </Eyebrow>
          <ul {...stylex.props(styles.moreList)}>
            {more.map((item) => (
              <li key={item.id}>
                <a href={item.url} {...stylex.props(styles.moreItem)}>
                  <span aria-hidden {...stylex.props(styles.moreGlyph)}>
                    {glyphOf(item)}
                  </span>
                  <span {...stylex.props(styles.moreTitle)}>{item.title}</span>
                  <span {...stylex.props(styles.moreTime)}>
                    <RelativeTime timestamp={item.publishedAt} asOf={asOf} />
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

function PinnedMedia({ item }: { item: HighPriorityItem }) {
  switch (item.kind) {
    case "blog-post":
      return (
        <Artwork
          image={item.hero}
          variant="photo"
          caption={item.hero.alt}
          style={styles.media}
        />
      );
    case "thread":
      return item.image ? (
        <Artwork
          image={item.image}
          variant="photo"
          caption={item.image.alt}
          style={styles.media}
        />
      ) : null;
    case "film-review":
      return (
        <Artwork
          image={item.poster}
          variant="poster"
          caption="poster"
          style={styles.media}
        />
      );
  }
}
