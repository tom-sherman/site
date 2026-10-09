import * as stylex from "@stylexjs/stylex";
import { fonts } from "./tokens.stylex";

/** Type icons are text set in the mono font. Don't swap them for an icon set. */
const GLYPHS = {
  all: "*",
  writing: "¶",
  bluesky: "✱",
  x: "✕",
  reply: "↳",
  film: "◐",
  music: "♫",
  games: "▶",
  code: "⌥",
  pinned: "◆",
  external: "↗",
  cycle: "⇄",
} as const;

export type GlyphName = keyof typeof GLYPHS;

const styles = stylex.create({
  glyph: {
    fontFamily: fonts.mono,
    userSelect: "none",
  },
});

/** Decorative, so hidden from screen readers and left out of text selection. */
export function Glyph({ name }: { name: GlyphName }) {
  return (
    <span aria-hidden {...stylex.props(styles.glyph)}>
      {GLYPHS[name]}
    </span>
  );
}
