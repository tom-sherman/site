import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { Artwork } from "@/lib/components/Artwork";
import { Glyph } from "@/lib/components/Glyph";
import { RelativeTime } from "@/lib/components/RelativeTime";
import { RichText } from "@/lib/components/RichText";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import type { FeedItem } from "@/lib/data/feed";
import type { Timestamp } from "@/lib/data/types";
import { categoryOf, glyphOf, labelOf } from "@/lib/feed";
import { DisclosurePanel, Disclosures, DisclosureToggle } from "./Disclosure";
import { ShownFor } from "./FeedFilter";

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
  "follow",
  "track",
  "game-session",
  "episode",
  "github",
] as const satisfies FeedItem["kind"][];

/**
 * All of a day's passive activity (replies, likes, follows, songs, games,
 * episodes, GitHub events) collapsed into one line per kind, each showing its
 * newest item, e.g. `♫ Song — Artist +13 more`, and opening on its own to
 * show them all. A reply's text stays hidden until its view button is
 * pressed. Each line shows only while the feed's filter takes in its kind.
 */
export function LowSummary({
  items,
  asOf,
}: {
  items: FeedItem[];
  asOf: Timestamp;
}) {
  return (
    <div {...stylex.props(styles.root)}>
      {KINDS.map((kind) => {
        const ofKind = items.filter((i) => i.kind === kind);
        if (!ofKind.length) return null;
        return (
          <ShownFor key={kind} categories={[categoryOf(ofKind[0])]}>
            <SummaryLine items={ofKind} asOf={asOf} />
          </ShownFor>
        );
      })}
    </div>
  );
}

/** One kind's line: its newest item, and the rest when opened. */
function SummaryLine({ items, asOf }: { items: FeedItem[]; asOf: Timestamp }) {
  const [newest] = items;
  const body = bodyOf(newest);
  return (
    <Disclosures>
      <div>
        <div {...stylex.props(styles.summary)}>
          <Glyph name={glyphOf(newest)} />
          <Label item={newest} style={styles.label} />
          {body && <DisclosureToggle name="body" show="view" hide="hide" />}
          {items.length > 1 && (
            <DisclosureToggle
              name="list"
              show={`+${items.length - 1} more`}
              hide="collapse"
            />
          )}
        </div>
        {body && (
          <DisclosurePanel name="body">
            <p {...stylex.props(styles.body)}>{body}</p>
          </DisclosurePanel>
        )}
        {items.length > 1 && (
          <DisclosurePanel name="list">
            <ItemList items={items} asOf={asOf} />
          </DisclosurePanel>
        )}
      </div>
    </Disclosures>
  );
}

/** Text an item hides behind a view button: a reply's. */
function bodyOf(item: FeedItem): ReactNode {
  return item.kind === "reply" && item.text.trim() ? (
    <RichText text={item.text} facets={item.facets} />
  ) : undefined;
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
  return (
    <Disclosures>
      <li {...stylex.props(styles.item)}>
        <span {...stylex.props(styles.time)}>
          <RelativeTime timestamp={item.publishedAt} asOf={asOf} />
        </span>
        <Swatch item={item} />
        <span {...stylex.props(styles.cell)}>
          <Label item={item} style={styles.text} />
          {body && <DisclosureToggle name="body" show="view" hide="hide" />}
        </span>
        {body && (
          <DisclosurePanel name="body">
            <p {...stylex.props(styles.body, styles.bodyInList)}>{body}</p>
          </DisclosurePanel>
        )}
      </li>
    </Disclosures>
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
          : item.kind === "follow"
            ? item.person?.avatar
            : item.kind === "reply" && item.replyTo?.kind === "person"
              ? item.replyTo.person.avatar
              : undefined;
  if (!art) return <span {...stylex.props(styles.swatch, styles.noArt)} />;
  return <Artwork image={art} variant="cover" style={styles.swatch} />;
}
