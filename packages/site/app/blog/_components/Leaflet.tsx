import "server-only";
import { segmentize } from "@atcute/bluesky-richtext-segmenter";
import { getBlobCidString } from "@atproto/lex";
import { pub } from "@repo/atproto-client";
import * as stylex from "@stylexjs/stylex";
import { Fragment, type ReactNode } from "react";
import { Card, CardHeader } from "@/lib/components/Card";
import { colors, fontSizes } from "@/lib/components/tokens.stylex";
import type { LeafletPage } from "@/lib/data/blog";
import { bskyProfileUrl, cdnImageUrl } from "@/lib/data/bluesky";
import { CodeBlock } from "./CodeBlock";
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

const styles = stylex.create({
  websiteBody: {
    paddingTop: 12,
    paddingInline: 18,
    paddingBottom: 16,
  },
  websiteTitle: {
    fontWeight: 600,
    color: colors.ink,
  },
  websiteDescription: {
    marginTop: 4,
    fontSize: fontSizes.body,
    lineHeight: 1.45,
    color: colors.subtle,
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
  const context: Context = { did, idFor: headingIds() };
  return (
    <Body>
      {pages.flatMap((page, i) =>
        page.blocks.map(({ block }, j) => (
          <Fragment key={`${i}-${j}`}>{renderBlock(block, context)}</Fragment>
        )),
      )}
    </Body>
  );
}

interface Context {
  did: string;
  idFor: (text: string) => string;
}

function renderBlock(block: Block, context: Context): ReactNode {
  if (blocks.text.$isTypeOf(block)) {
    // Leaflet uses empty paragraphs for spacing; the prose has its own.
    if (!block.plaintext.trim()) return null;
    return (
      <P>
        <RichText text={block.plaintext} facets={block.facets} />
      </P>
    );
  }
  if (blocks.header.$isTypeOf(block)) {
    if (!block.plaintext.trim()) return null;
    // The post's title is the `h1`, so Leaflet's top two levels are both `h2`.
    const level = Math.min(4, Math.max(2, block.level ?? 2)) as 2 | 3 | 4;
    return (
      <Heading level={level} id={context.idFor(block.plaintext)}>
        <RichText text={block.plaintext} facets={block.facets} />
      </Heading>
    );
  }
  if (blocks.blockquote.$isTypeOf(block)) {
    return (
      <Blockquote>
        <P>
          <RichText text={block.plaintext} facets={block.facets} />
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
    return <RichText text={content.plaintext} facets={content.facets} />;
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
  if (!URL.canParse(block.src)) return null;
  const { protocol, hostname } = new URL(block.src);
  if (protocol !== "https:" && protocol !== "http:") return null;
  const preview =
    block.previewImage &&
    cdnImageUrl("feed_thumbnail", did, getBlobCidString(block.previewImage));
  return (
    <Card href={block.src}>
      <CardHeader glyph="external" label={hostname} />
      {preview && <Img src={preview} alt="" />}
      <div {...stylex.props(styles.websiteBody)}>
        <div {...stylex.props(styles.websiteTitle)}>
          {block.title || block.src}
        </div>
        {block.description && (
          <p {...stylex.props(styles.websiteDescription)}>
            {block.description}
          </p>
        )}
      </div>
    </Card>
  );
}

/**
 * Leaflet's rich text. Its facets can overlap (bold over part of a link, say),
 * which the segmenter doesn't expect, so they're split into ranges that don't
 * first, each with the features of every facet covering it.
 */
function RichText({ text, facets = [] }: { text: string; facets?: Facet[] }) {
  return segmentize(text, disjoint(facets)).map(
    ({ text, features = [] }, i) => (
      <Fragment key={i}>{withFeatures(text, features)}</Fragment>
    ),
  );
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
  let node: ReactNode = text;
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
