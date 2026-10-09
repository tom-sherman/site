import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import { useState, type ReactNode } from "react";
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
    // Mono microcopy wherever it sits, even next to a list item's label.
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    fontWeight: "inherit",
    lineHeight: "inherit",
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
  // A list item's label and its view button.
  cell: {
    display: "flex",
    alignItems: "center",
    minWidth: 0,
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
  // A reply's text, once viewed.
  body: {
    maxWidth: "60ch",
    marginTop: 4,
    fontFamily: fonts.sans,
    fontSize: 13.5,
    lineHeight: 1.45,
    color: colors.ink,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
    textWrap: "pretty",
  },
  // Under the label, in a list item.
  bodyInList: {
    gridColumn: "3",
    marginTop: 0,
    marginBottom: 6,
  },
});

/** Low-priority kinds, in the order their lines appear. */
const KINDS = [
  "reply",
  "like",
  "track",
  "game-session",
  "episode",
  "github",
] as const satisfies FeedItem["kind"][];

export type LowKind = (typeof KINDS)[number];

/**
 * All of a day's passive activity (replies, likes, songs, games, episodes,
 * GitHub events) collapsed into one line per kind, each showing its newest
 * item, e.g. `♫ Song — Artist +13 more`, and opening on its own to show them
 * all. A reply's text stays hidden until its view button is pressed.
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
        return (
          <SummaryLine
            key={kind}
            items={ofKind}
            open={!!open[kind]}
            onToggle={() => onToggle(kind)}
            asOf={asOf}
          />
        );
      })}
    </div>
  );
}

/** One kind's line: its newest item, and the rest when opened. */
function SummaryLine({
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
  const [newest] = items;
  const body = bodyOf(newest);
  const [viewing, setViewing] = useState(false);
  return (
    <div>
      <div {...stylex.props(styles.summary)}>
        <Glyph name={glyphOf(newest)} />
        <Label item={newest} style={styles.label} />
        {body && (
          <Toggle open={viewing} onToggle={() => setViewing(!viewing)}>
            {viewing ? "hide" : "view"}
          </Toggle>
        )}
        {items.length > 1 && (
          <Toggle open={open} onToggle={onToggle}>
            {open ? "collapse" : `+${items.length - 1} more`}
          </Toggle>
        )}
      </div>
      {body && viewing && <p {...stylex.props(styles.body)}>{body}</p>}
      {open && items.length > 1 && <ItemList items={items} asOf={asOf} />}
    </div>
  );
}

/** Text an item hides behind a view button: a reply's. */
function bodyOf(item: FeedItem): string | undefined {
  return item.kind === "reply" && item.text.trim() ? item.text : undefined;
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
      {children}
    </button>
  );
}

function ItemList({ items, asOf }: { items: FeedItem[]; asOf: Timestamp }) {
  return (
    <ul {...stylex.props(styles.list)}>
      {items.map((item) => (
        <ListItem key={item.id} item={item} asOf={asOf} />
      ))}
    </ul>
  );
}

function ListItem({ item, asOf }: { item: FeedItem; asOf: Timestamp }) {
  const body = bodyOf(item);
  const [viewing, setViewing] = useState(false);
  return (
    <li {...stylex.props(styles.item)}>
      <span {...stylex.props(styles.time)}>
        <RelativeTime timestamp={item.publishedAt} asOf={asOf} />
      </span>
      <Swatch item={item} />
      <span {...stylex.props(styles.cell)}>
        <Label item={item} style={styles.text} />
        {body && (
          <Toggle open={viewing} onToggle={() => setViewing(!viewing)}>
            {viewing ? "hide" : "view"}
          </Toggle>
        )}
      </span>
      {body && viewing && (
        <p {...stylex.props(styles.body, styles.bodyInList)}>{body}</p>
      )}
    </li>
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
          ? item.author?.avatar
          : item.kind === "reply" && item.replyTo?.kind === "person"
            ? item.replyTo.person.avatar
            : undefined;
  if (!art) return <span {...stylex.props(styles.swatch, styles.noArt)} />;
  return <Artwork image={art} variant="cover" style={styles.swatch} />;
}
