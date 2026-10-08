import * as stylex from "@stylexjs/stylex";
import { Artwork } from "@/lib/components/Artwork";
import { Glyph, type GlyphName } from "@/lib/components/Glyph";
import { RelativeTime } from "@/lib/components/RelativeTime";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import type { FeedItem } from "@/lib/data/feed";
import type { Timestamp } from "@/lib/data/types";
import { labelOf } from "@/lib/feed";
import { formatMinutes } from "@/lib/time";

const styles = stylex.create({
  root: {
    paddingTop: 8,
    paddingBottom: 30,
    paddingLeft: 2,
  },
  summary: {
    appearance: "none",
    cursor: "pointer",
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    rowGap: 4,
    columnGap: 14,
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    textAlign: "left",
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    lineHeight: "inherit",
    color: {
      default: colors.subtle,
      ":hover": colors.ink,
    },
  },
  part: {
    display: "flex",
    gap: 6,
  },
  toggle: {
    color: colors.ink,
    textDecorationLine: "underline",
    textDecorationColor: colors.underline,
    textUnderlineOffset: 3,
  },
  list: {
    display: "grid",
    gap: 3,
    marginTop: 10,
    paddingLeft: 12,
    listStyle: "none",
    borderLeftWidth: 1,
    borderLeftStyle: "dashed",
    borderLeftColor: colors.dashedRule,
  },
  item: {
    display: "grid",
    gridTemplateColumns: "62px 12px minmax(0, 1fr)",
    alignItems: "center",
    gap: 8,
  },
  time: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.muted,
  },
  swatch: {
    width: 10,
    height: 10,
    padding: 0,
  },
  noArt: {
    backgroundColor: colors.lowMarker,
  },
  text: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 13,
    lineHeight: 1.5,
  },
});

/**
 * All of a day's passive activity (songs, games, episodes, GitHub events)
 * collapsed into one row: `♫ 14 tracks  ▶ Balatro 2h 14m  +19 more`.
 */
export function LowSummary({
  items,
  open,
  onToggle,
  asOf,
}: {
  items: FeedItem[];
  open: boolean;
  onToggle: () => void;
  asOf: Timestamp;
}) {
  return (
    <div {...stylex.props(styles.root)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        {...stylex.props(styles.summary)}
      >
        {summarise(items).map(({ glyph, text }, i) => (
          <span key={i} {...stylex.props(styles.part)}>
            <Glyph name={glyph} />
            <span>{text}</span>
          </span>
        ))}
        <span {...stylex.props(styles.toggle)}>
          {open ? "collapse" : `+${items.length} more`}
        </span>
      </button>
      {open && (
        <ul {...stylex.props(styles.list)}>
          {items.map((item) => (
            <li key={item.id} {...stylex.props(styles.item)}>
              <span {...stylex.props(styles.time)}>
                <RelativeTime timestamp={item.publishedAt} asOf={asOf} />
              </span>
              <Swatch item={item} />
              <span {...stylex.props(styles.text)}>{labelOf(item)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Swatch({ item }: { item: FeedItem }) {
  const art =
    item.kind === "track" || item.kind === "episode"
      ? item.art
      : item.kind === "game-session"
        ? item.cover
        : undefined;
  if (!art) return <span {...stylex.props(styles.swatch, styles.noArt)} />;
  return <Artwork image={art} variant="cover" style={styles.swatch} />;
}

function summarise(items: FeedItem[]) {
  const parts: { glyph: GlyphName; text: string }[] = [];
  const count = (kind: FeedItem["kind"]) =>
    items.filter((i) => i.kind === kind).length;
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;

  const tracks = count("track");
  if (tracks) parts.push({ glyph: "music", text: plural(tracks, "track") });
  for (const item of items) {
    if (item.kind === "game-session") {
      parts.push({
        glyph: "games",
        text: `${item.title} ${formatMinutes(item.minutes)}`,
      });
    }
  }
  const episodes = count("episode");
  if (episodes) {
    parts.push({ glyph: "film", text: plural(episodes, "episode") });
  }
  const github = count("github");
  if (github) parts.push({ glyph: "code", text: `${github} on GitHub` });
  return parts;
}
