import * as stylex from "@stylexjs/stylex";
import { Artwork } from "@/lib/components/Artwork";
import { Avatar } from "@/lib/components/Avatar";
import { Glyph } from "@/lib/components/Glyph";
import { RichText } from "@/lib/components/RichText";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import type { FilmRatingItem, PostItem, RepostItem } from "@/lib/data/feed";
import {
  filmRatingLabel,
  formatCount,
  formatStars,
  glyphOf,
  labelOf,
} from "@/lib/feed";

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
  // As wide as an avatar, so the text lines up with posts'.
  poster: {
    width: 28,
    aspectRatio: "2 / 3",
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

/** Short posts, reposts and film ratings: a plain row, no card, no media. */
export function MediumRow({
  item,
}: {
  item: PostItem | RepostItem | FilmRatingItem;
}) {
  return (
    <div {...stylex.props(styles.row)}>
      {item.kind === "film-rating" ? (
        <Artwork image={item.poster} variant="poster" style={styles.poster} />
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
          {item.kind !== "film-rating" ? (
            <RichText text={item.text} facets={item.facets} />
          ) : item.year !== undefined ? (
            `${item.title} (${item.year})`
          ) : (
            item.title
          )}
        </div>
      </div>
      {item.kind !== "film-rating" ? (
        <span {...stylex.props(styles.aside)}>♡ {formatCount(item.likes)}</span>
      ) : (
        <span
          aria-label={filmRatingLabel(item)}
          {...stylex.props(styles.aside)}
        >
          {item.liked && (
            <>
              <Glyph name="liked" />{" "}
            </>
          )}
          {formatStars(item.rating)}
        </span>
      )}
    </div>
  );
}
