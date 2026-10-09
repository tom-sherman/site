import { segmentize } from "@atcute/bluesky-richtext-segmenter";
import type { l } from "@atproto/lex";
import type { app } from "@repo/atproto-client";
import * as stylex from "@stylexjs/stylex";
import type { Facet } from "@/lib/data/types";
import { colors } from "./tokens.stylex";

const styles = stylex.create({
  mention: {
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
 * A Bluesky post's text, with its mentions linked to the mentioned profiles.
 * Other facets (links, tags) are shown as plain text for now. `linked={false}`
 * marks mentions without linking them, for text that's already inside a link.
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
    const mention = features?.find(isMention);
    if (!mention) return text;
    return linked ? (
      <a
        key={i}
        href={`https://bsky.app/profile/${mention.did}`}
        {...stylex.props(styles.mention)}
      >
        {text}
      </a>
    ) : (
      <span key={i} {...stylex.props(styles.mention)}>
        {text}
      </span>
    );
  });
}

function isMention(
  feature: Facet["features"][number],
): feature is l.$Typed<app.bsky.richtext.facet.Mention> {
  return feature.$type === "app.bsky.richtext.facet#mention";
}
