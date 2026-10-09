import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { Artwork } from "@/lib/components/Artwork";
import { Glyph } from "@/lib/components/Glyph";
import { RelativeTime } from "@/lib/components/RelativeTime";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import type { FeedItem } from "@/lib/data/feed";
import type { Timestamp } from "@/lib/data/types";
import { glyphOf, labelOf } from "@/lib/feed";

const styles = stylex.create({
  root: {
    display: "grid",
    rowGap: 6,
    paddingTop: 8,
    paddingBottom: 30,
    paddingLeft: 2,
  },
  summary: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.subtle,
  },
  // A long label shrinks to fit rather than overflowing the line.
  label: {
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  link: {
    color: {
      default: "inherit",
      ":hover": colors.ink,
    },
    textDecorationLine: {
      default: "none",
      ":hover": "underline",
    },
  },
  toggle: {
    flexShrink: 0,
    marginLeft: 8,
    appearance: "none",
    cursor: "pointer",
    padding: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    font: "inherit",
    color: colors.ink,
    textDecorationLine: "underline",
    textDecorationColor: {
      default: colors.underline,
      ":hover": "currentColor",
    },
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

/** Low-priority kinds, in the order their lines appear. */
const KINDS = [
  "like",
  "track",
  "game-session",
  "episode",
  "github",
] as const satisfies FeedItem["kind"][];

export type LowKind = (typeof KINDS)[number];

/**
 * All of a day's passive activity (likes, songs, games, episodes, GitHub events)
 * collapsed into one line per kind, each showing its newest item, e.g.
 * `♫ Song — Artist +13 more`, and opening on its own to show them all.
 */
export function LowSummary({
  items,
  open,
  onToggle,
  asOf,
}: {
  items: FeedItem[];
  open: Readonly<Partial<Record<LowKind, boolean>>>;
  onToggle: (kind: LowKind) => void;
  asOf: Timestamp;
}) {
  return (
    <div {...stylex.props(styles.root)}>
      {KINDS.map((kind) => {
        const ofKind = items.filter((i) => i.kind === kind);
        if (!ofKind.length) return null;
        const [newest] = ofKind;
        return (
          <div key={kind}>
            <div {...stylex.props(styles.summary)}>
              <Glyph name={glyphOf(newest)} />
              <Label item={newest} style={styles.label} />
              {ofKind.length > 1 && (
                <Toggle open={!!open[kind]} onToggle={() => onToggle(kind)}>
                  +{ofKind.length - 1} more
                </Toggle>
              )}
            </div>
            {open[kind] && ofKind.length > 1 && (
              <ItemList items={ofKind} asOf={asOf} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Toggle({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      {...stylex.props(styles.toggle)}
    >
      {open ? "collapse" : children}
    </button>
  );
}

function ItemList({ items, asOf }: { items: FeedItem[]; asOf: Timestamp }) {
  return (
    <ul {...stylex.props(styles.list)}>
      {items.map((item) => (
        <li key={item.id} {...stylex.props(styles.item)}>
          <span {...stylex.props(styles.time)}>
            <RelativeTime timestamp={item.publishedAt} asOf={asOf} />
          </span>
          <Swatch item={item} />
          <Label item={item} style={styles.text} />
        </li>
      ))}
    </ul>
  );
}

function Label({ item, style }: { item: FeedItem; style: StyleXStyles }) {
  return (
    <a href={item.url} {...stylex.props(style, styles.link)}>
      {labelOf(item)}
    </a>
  );
}

function Swatch({ item }: { item: FeedItem }) {
  const art =
    item.kind === "track" || item.kind === "episode"
      ? item.art
      : item.kind === "game-session"
        ? item.cover
        : item.kind === "like"
          ? item.post?.author.avatar
          : undefined;
  if (!art) return <span {...stylex.props(styles.swatch, styles.noArt)} />;
  return <Artwork image={art} variant="cover" style={styles.swatch} />;
}
