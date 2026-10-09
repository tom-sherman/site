import * as stylex from "@stylexjs/stylex";
import { Artwork } from "@/lib/components/Artwork";
import { Avatar } from "@/lib/components/Avatar";
import { Glyph } from "@/lib/components/Glyph";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import type { FilmRatingItem, PostItem } from "@/lib/data/feed";
import { formatCount, formatStars, glyphOf, labelOf } from "@/lib/feed";

const styles = stylex.create({
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    paddingTop: 10,
    paddingRight: 8,
    paddingBottom: 30,
    paddingLeft: 2,
  },
  thumb: {
    width: 28,
    height: 28,
    padding: 0,
    borderRadius: 2,
  },
  main: {
    flexGrow: 1,
    minWidth: 0,
  },
  meta: {
    display: "flex",
    flexWrap: "wrap",
    rowGap: 4,
    columnGap: 8,
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  ink: {
    color: colors.ink,
  },
  link: {
    textDecorationLine: {
      default: "none",
      ":hover": "underline",
    },
  },
  text: {
    marginTop: 4,
    maxWidth: "60ch",
    fontSize: fontSizes.body,
    lineHeight: 1.45,
    textWrap: "pretty",
  },
  aside: {
    paddingTop: 1,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    whiteSpace: "nowrap",
  },
});

/** Short posts and film ratings: a plain row, no card, no media. */
export function MediumRow({ item }: { item: PostItem | FilmRatingItem }) {
  return (
    <div {...stylex.props(styles.row)}>
      {item.kind === "film-rating" ? (
        <Artwork image={item.poster} variant="poster" style={styles.thumb} />
      ) : (
        <Avatar name={item.author.name} image={item.author.avatar} />
      )}
      <div {...stylex.props(styles.main)}>
        <div {...stylex.props(styles.meta)}>
          <a href={item.url} {...stylex.props(styles.ink, styles.link)}>
            <Glyph name={glyphOf(item)} /> {labelOf(item)}
          </a>
        </div>
        <div {...stylex.props(styles.text)}>
          {item.kind === "post" ? item.text : `${item.title} (${item.year})`}
        </div>
      </div>
      {item.kind === "post" ? (
        <span {...stylex.props(styles.aside)}>♡ {formatCount(item.likes)}</span>
      ) : (
        <span
          aria-label={`${item.rating} out of 5 stars`}
          {...stylex.props(styles.aside)}
        >
          {formatStars(item.rating)}
        </span>
      )}
    </div>
  );
}
