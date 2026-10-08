import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { Glyph, type GlyphName } from "./Glyph";
import { colors, fonts, fontSizes, shadows } from "./tokens.stylex";

const styles = stylex.create({
  card: {
    display: "block",
    color: "inherit",
    textDecoration: "none",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: colors.cardBorder,
      ":hover": colors.ink,
    },
    boxShadow: shadows.card,
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    paddingBlock: 12,
    paddingInline: 18,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.rule,
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    letterSpacing: "0.04em",
  },
  title: {
    display: "flex",
    flexGrow: 1,
    gap: 8,
  },
  label: {
    textTransform: "uppercase",
  },
  meta: {
    color: colors.muted,
  },
});

/** A surface that links somewhere as a whole. Square corners, soft shadow. */
export function Card({
  href,
  children,
  style,
}: {
  href: string;
  children: ReactNode;
  /** Spacing from neighbouring content. */
  style?: StyleXStyles<{
    marginTop?: number | string;
    marginBottom?: number | string;
  }>;
}) {
  return (
    <a href={href} {...stylex.props(styles.card, style)}>
      {children}
    </a>
  );
}

/** `¶ BLOG POST · 9 min read          ↗` */
export function CardHeader({
  glyph,
  label,
  meta,
}: {
  glyph: GlyphName;
  label: string;
  meta?: string;
}) {
  return (
    <div {...stylex.props(styles.header)}>
      <Glyph name={glyph} />
      <span {...stylex.props(styles.title)}>
        <span {...stylex.props(styles.label)}>{label}</span>
        {meta && <span {...stylex.props(styles.meta)}>· {meta}</span>}
      </span>
      <Glyph name="external" />
    </div>
  );
}
