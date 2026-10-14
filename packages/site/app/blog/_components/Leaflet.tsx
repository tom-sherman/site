import "server-only";
import { segmentize } from "@atcute/bluesky-richtext-segmenter";
import { getBlobCidString } from "@atproto/lex";
import { pub } from "@repo/atproto-client";
import * as stylex from "@stylexjs/stylex";
import { Fragment, type ReactNode } from "react";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import type { LeafletPage } from "@/lib/data/blog";
import { bskyProfileUrl, cdnImageUrl } from "@/lib/data/bluesky";
import { CodeBlock } from "./CodeBlock";
import { LinkCard } from "./LinkCard";
import { BskyEmbed } from "./PostEmbed";
import {
  A,
  Blockquote,
  Body,
  Heading,
  headingIds,
  Hr,
  Img,
  InlineCode,
  List,
  ListItem,
  Mark,
  P,
  Strong,
} from "./Prose";

const { blocks, richtext } = pub.leaflet;
const facet = richtext.facet;

type Block = LeafletPage["blocks"][number]["block"];
type Facet = pub.leaflet.richtext.facet.Main;
type ListItemValue =
  | pub.leaflet.blocks.unorderedList.ListItem
  | pub.leaflet.blocks.orderedList.ListItem;
type Footnote = pub.leaflet.richtext.facet.Footnote;

const styles = stylex.create({
  footnoteRef: {
    fontFamily: fonts.mono,
    fontSize: "0.62em",
    lineHeight: 0,
    verticalAlign: "super",
  },
  footnoteLink: {
    paddingInline: 2,
    color: colors.ink,
    textDecorationLine: {
      default: "none",
      ":hover": "underline",
    },
  },
  footnotes: {
    marginTop: "1em",
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.rule,
    fontSize: fontSizes.body,
    lineHeight: 1.55,
    color: colors.subtle,
  },
  footnoteList: {
    paddingLeft: "1.3em",
  },
  footnote: {
    marginTop: "0.5em",
    paddingLeft: "0.2em",
    scrollMarginTop: 24,
  },
  backLink: {
    marginLeft: 6,
    color: colors.muted,
    textDecorationLine: "none",
  },
});

/**
 * A post written in Leaflet: its pages' blocks, in order, as the same prose
 * components Markdown posts use. Blocks that only make sense inside Leaflet
 * (polls, sign-ups, canvases…) are left out.
 */
export function LeafletContent({
  did,
  pages,
}: {
  /** The repo holding the document, and so its images. */
  did: string;
  pages: LeafletPage[];
}) {
  const footnotes = collectFootnotes(pages);
  const context: Context = {
    did,
    idFor: headingIds(),
    footnotes: new Map(footnotes.map((f, i) => [f.footnoteId, i + 1])),
    referenced: new Set(),
  };
  return (
    <Body>
      {pages.flatMap((page, i) =>
        page.blocks.map(({ block }, j) => (
          <Fragment key={`${i}-${j}`}>{renderBlock(block, context)}</Fragment>
        )),
      )}
      {footnotes.length > 0 && (
        <Footnotes footnotes={footnotes} context={context} />
      )}
    </Body>
  );
}

interface Context {
  did: string;
  idFor: (text: string) => string;
  /** Each footnote's number, in order of first reference. */
  footnotes: Map<string, number>;
  /** Footnotes already referenced, so only the first reference gets the id to jump back to. */
  referenced: Set<string>;
}

function renderBlock(block: Block, context: Context): ReactNode {
  if (blocks.text.$isTypeOf(block)) {
    // Leaflet uses empty paragraphs for spacing; the prose has its own.
    if (!block.plaintext.trim()) return null;
    return (
      <P>
        <RichText
          text={block.plaintext}
          facets={block.facets}
          context={context}
        />
      </P>
    );
  }
  if (blocks.header.$isTypeOf(block)) {
    if (!block.plaintext.trim()) return null;
    // The post's title is the `h1`, so Leaflet's top two levels are both `h2`.
    const level = Math.min(4, Math.max(2, block.level ?? 2)) as 2 | 3 | 4;
    return (
      <Heading level={level} id={context.idFor(block.plaintext)}>
        <RichText
          text={block.plaintext}
          facets={block.facets}
          context={context}
        />
      </Heading>
    );
  }
  if (blocks.blockquote.$isTypeOf(block)) {
    return (
      <Blockquote>
        <P>
          <RichText
            text={block.plaintext}
            facets={block.facets}
            context={context}
          />
        </P>
      </Blockquote>
    );
  }
  if (blocks.image.$isTypeOf(block)) {
    return <Image block={block} did={context.did} />;
  }
  if (blocks.unorderedList.$isTypeOf(block)) {
    return <LeafletList items={block.children} context={context} />;
  }
  if (blocks.orderedList.$isTypeOf(block)) {
    return (
      <LeafletList
        ordered
        start={block.startIndex}
        items={block.children}
        context={context}
      />
    );
  }
  if (blocks.code.$isTypeOf(block)) {
    return <CodeBlock code={block.plaintext} language={block.language} />;
  }
  if (blocks.math.$isTypeOf(block)) {
    return <CodeBlock code={block.tex} language="latex" />;
  }
  if (blocks.horizontalRule.$isTypeOf(block)) return <Hr />;
  if (blocks.bskyPost.$isTypeOf(block)) {
    return <BskyEmbed uri={block.postRef.uri} />;
  }
  if (blocks.website.$isTypeOf(block)) {
    return <Website block={block} did={context.did} />;
  }
  console.warn(`Leaving out Leaflet block ${block.$type}`);
  return null;
}

function LeafletList({
  ordered = false,
  start,
  items,
  context,
}: {
  ordered?: boolean;
  start?: number;
  items: ListItemValue[];
  context: Context;
}) {
  return (
    <List ordered={ordered} start={start}>
      {items.map((item, i) => {
        const nested = nestedList(item, ordered);
        return (
          <ListItem key={i}>
            {listItemContent(item.content, context)}
            {nested && (
              <LeafletList
                ordered={nested.ordered}
                start={nested.start}
                items={nested.items}
                context={context}
              />
            )}
          </ListItem>
        );
      })}
    </List>
  );
}

/** Text in a list item is inline, without a paragraph around it. */
function listItemContent(content: ListItemValue["content"], context: Context) {
  if (blocks.text.$isTypeOf(content) || blocks.header.$isTypeOf(content)) {
    return (
      <RichText
        text={content.plaintext}
        facets={content.facets}
        context={context}
      />
    );
  }
  return renderBlock(content, context);
}

/**
 * An item's nested list: `children` are the same kind as its own list; the
 * other kind is separate. They're mutually exclusive, and `children` wins.
 */
function nestedList(item: ListItemValue, ordered: boolean) {
  if (item.children?.length) {
    return { ordered, items: item.children, start: undefined };
  }
  if ("orderedListChildren" in item && item.orderedListChildren) {
    const { children, startIndex } = item.orderedListChildren;
    return { ordered: true, items: children, start: startIndex };
  }
  if ("unorderedListChildren" in item && item.unorderedListChildren) {
    const { children } = item.unorderedListChildren;
    return { ordered: false, items: children, start: undefined };
  }
  return undefined;
}

function Image({
  block,
  did,
}: {
  block: pub.leaflet.blocks.image.Main;
  did: string;
}) {
  return (
    <Img
      src={cdnImageUrl("feed_fullsize", did, getBlobCidString(block.image))}
      alt={block.alt}
      width={block.aspectRatio.width}
      height={block.aspectRatio.height}
    />
  );
}

function Website({
  block,
  did,
}: {
  block: pub.leaflet.blocks.website.Main;
  did: string;
}) {
  return (
    <LinkCard
      href={block.src}
      title={block.title}
      description={block.description}
      image={
        block.previewImage &&
        cdnImageUrl("feed_thumbnail", did, getBlobCidString(block.previewImage))
      }
    />
  );
}

/**
 * Leaflet's rich text. Leaflet writes facets that don't overlap, but the
 * segmenter would mangle any that did, so they're split into ranges that
 * don't first, each with the features of every facet covering it.
 */
function RichText({
  text,
  facets = [],
  context,
}: {
  text: string;
  facets?: Facet[];
  context: Context;
}) {
  return segmentize(text, disjoint(facets)).map(
    ({ text, features = [] }, i) => {
      // The footnote's number replaces the placeholder it's anchored to.
      const footnote = features.find((f) => facet.footnote.isTypeOf(f));
      return (
        <Fragment key={i}>
          {footnote ? (
            <FootnoteRef id={footnote.footnoteId} context={context} />
          ) : (
            withFeatures(text, features)
          )}
        </Fragment>
      );
    },
  );
}

/** Soft line breaks within a block, which Leaflet stores as `\n`. */
function withLineBreaks(text: string): ReactNode {
  const lines = text.split("\n");
  return lines.map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line}
    </Fragment>
  ));
}

function disjoint(facets: Facet[]): Facet[] {
  const points = [
    ...new Set(facets.flatMap(({ index }) => [index.byteStart, index.byteEnd])),
  ].sort((a, b) => a - b);
  return points.slice(1).flatMap((byteEnd, i) => {
    const byteStart = points[i];
    const features = facets
      .filter(
        ({ index }) => index.byteStart <= byteStart && index.byteEnd >= byteEnd,
      )
      .flatMap((f) => f.features);
    return features.length ? [{ index: { byteStart, byteEnd }, features }] : [];
  });
}

/** Formatting inside, links outside, so a link's underline covers it all. */
function withFeatures(text: string, features: Facet["features"]) {
  let node: ReactNode = withLineBreaks(text);
  const types = new Set<string>(features.map((f) => f.$type));
  const has = (schema: { $type: string }) => types.has(schema.$type);
  if (has(facet.code)) node = <InlineCode>{node}</InlineCode>;
  if (has(facet.bold)) node = <Strong>{node}</Strong>;
  if (has(facet.italic)) node = <em>{node}</em>;
  if (has(facet.underline)) node = <u>{node}</u>;
  if (has(facet.strikethrough)) node = <s>{node}</s>;
  if (has(facet.highlight)) node = <Mark>{node}</Mark>;
  for (const feature of features) {
    if (facet.link.isTypeOf(feature)) {
      node = <A href={feature.uri}>{node}</A>;
    } else if (facet.didMention.isTypeOf(feature)) {
      node = <A href={bskyProfileUrl(feature.did)}>{node}</A>;
    } else if (facet.atMention.isTypeOf(feature) && feature.href) {
      node = <A href={feature.href}>{node}</A>;
    } else if (facet.id.isTypeOf(feature) && feature.id) {
      node = <span id={feature.id}>{node}</span>;
    }
  }
  return node;
}

/** Footnotes in the order they're first referenced, as Leaflet numbers them. */
function collectFootnotes(pages: LeafletPage[]): Footnote[] {
  const found = new Map<string, Footnote>();
  const scan = (facets: Facet[] = []) => {
    for (const { features } of facets.toSorted(
      (a, b) => a.index.byteStart - b.index.byteStart,
    )) {
      for (const feature of features) {
        if (facet.footnote.isTypeOf(feature) && !found.has(feature.footnoteId))
          found.set(feature.footnoteId, feature);
      }
    }
  };
  const scanItems = (items: ListItemValue[] = []) => {
    for (const item of items) {
      if ("facets" in item.content) scan(item.content.facets as Facet[]);
      scanItems(item.children);
      if ("orderedListChildren" in item)
        scanItems(item.orderedListChildren?.children);
      if ("unorderedListChildren" in item)
        scanItems(item.unorderedListChildren?.children);
    }
  };
  for (const { block } of pages.flatMap((page) => page.blocks)) {
    if (
      blocks.text.$isTypeOf(block) ||
      blocks.header.$isTypeOf(block) ||
      blocks.blockquote.$isTypeOf(block)
    ) {
      scan(block.facets);
    } else if (
      blocks.unorderedList.$isTypeOf(block) ||
      blocks.orderedList.$isTypeOf(block)
    ) {
      scanItems(block.children);
    }
  }
  return [...found.values()];
}

/** Footnote ids are UUIDs; anything else isn't trusted in an `id`. */
const footnoteId = (id: string) => `fn-${id.replace(/[^\w-]/g, "")}`;

function FootnoteRef({ id, context }: { id: string; context: Context }) {
  const number = context.footnotes.get(id);
  if (number === undefined) return null;
  const first = !context.referenced.has(id);
  context.referenced.add(id);
  return (
    <sup {...stylex.props(styles.footnoteRef)}>
      <a
        href={`#${footnoteId(id)}`}
        id={first ? `${footnoteId(id)}-ref` : undefined}
        aria-label={`Footnote ${number}`}
        {...stylex.props(styles.footnoteLink)}
      >
        {number}
      </a>
    </sup>
  );
}

function Footnotes({
  footnotes,
  context,
}: {
  footnotes: Footnote[];
  context: Context;
}) {
  return (
    <section aria-label="Footnotes" {...stylex.props(styles.footnotes)}>
      <ol {...stylex.props(styles.footnoteList)}>
        {footnotes.map((footnote) => (
          <li
            key={footnote.footnoteId}
            id={footnoteId(footnote.footnoteId)}
            {...stylex.props(styles.footnote)}
          >
            <RichText
              text={footnote.contentPlaintext}
              facets={footnote.contentFacets}
              context={context}
            />
            <a
              href={`#${footnoteId(footnote.footnoteId)}-ref`}
              aria-label="Back to the text"
              {...stylex.props(styles.backLink)}
            >
              ↩
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
