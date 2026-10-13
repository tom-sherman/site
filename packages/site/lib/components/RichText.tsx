import { segmentize } from "@atcute/bluesky-richtext-segmenter";
import type { l } from "@atproto/lex";
import type { app } from "@repo/atproto-client";
import * as stylex from "@stylexjs/stylex";
import type { Facet } from "@/lib/data/types";
import { colors } from "./tokens.stylex";

const styles = stylex.create({
  link: {
    color: {
      default: "inherit",
      ":hover": colors.ink,
    },
    textDecorationLine: "underline",
    textDecorationColor: {
      default: colors.underline,
      ":hover": "currentColor",
    },
    textUnderlineOffset: 3,
  },
});

/**
 * A Bluesky post's text, with its mentions linked to the mentioned profiles
 * and its links to where they point. Tags are shown as plain text for now.
 * `linked={false}` marks them without linking them, for text that's already
 * inside a link.
 */
export function RichText({
  text,
  facets,
  linked = true,
}: {
  text: string;
  facets?: Facet[];
  linked?: boolean;
}) {
  // The segmenter walks the text once, so it needs facets in order.
  const sorted = facets?.toSorted(
    (a, b) => a.index.byteStart - b.index.byteStart,
  );
  return segmentize(text, sorted).map(({ text, features }, i) => {
    const href = features && hrefOf(features);
    if (!href) return text;
    return linked ? (
      <a key={i} href={href} {...stylex.props(styles.link)}>
        {text}
      </a>
    ) : (
      <span key={i} {...stylex.props(styles.link)}>
        {text}
      </span>
    );
  });
}

/**
 * Where a segment links: a mention to the profile, a link to its URI. A
 * link's URI is whatever the post's author wrote, so only web URLs count.
 */
function hrefOf(features: Facet["features"]): string | undefined {
  for (const feature of features) {
    if (isMention(feature)) return `https://bsky.app/profile/${feature.did}`;
    if (isLink(feature) && isWebUrl(feature.uri)) return feature.uri;
  }
  return undefined;
}

function isWebUrl(uri: string): boolean {
  const url = URL.parse(uri);
  return url?.protocol === "https:" || url?.protocol === "http:";
}

function isMention(
  feature: Facet["features"][number],
): feature is l.$Typed<app.bsky.richtext.facet.Mention> {
  return feature.$type === "app.bsky.richtext.facet#mention";
}

function isLink(
  feature: Facet["features"][number],
): feature is l.$Typed<app.bsky.richtext.facet.Link> {
  return feature.$type === "app.bsky.richtext.facet#link";
}
