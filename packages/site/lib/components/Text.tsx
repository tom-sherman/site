import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import Link from "next/link";
import type { ReactNode } from "react";
import { colors, fonts, fontSizes } from "./tokens.stylex";

const styles = stylex.create({
  tag: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    backgroundColor: colors.accent,
    color: colors.ink,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    fontWeight: 500,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  tagInactive: {
    backgroundColor: colors.muted,
  },
  tagSm: {
    paddingBlock: 2,
    paddingInline: 6,
  },
  tagMd: {
    paddingBlock: 3,
    paddingInline: 7,
  },
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    fontWeight: "inherit",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  muted: {
    color: colors.muted,
  },
  ink: {
    color: colors.ink,
  },
  rule: {
    flexGrow: 1,
    height: 1,
    backgroundColor: colors.rule,
  },
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
  // Only underlined on hover, for links that would be noisy at rest.
  linkQuiet: {
    textDecorationLine: {
      default: "none",
      ":hover": "underline",
    },
  },
  note: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    letterSpacing: 0,
    lineHeight: 1.5,
    color: colors.muted,
    maxWidth: "16ch",
    transform: "rotate(-4deg)",
  },
  sticker: {
    alignSelf: "flex-start",
    paddingBlock: 3,
    paddingInline: 8,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.ink,
    color: colors.ink,
    transform: "rotate(-1.5deg)",
  },
});

/**
 * Accent label: the NOW and PINNED tags. The accent goes nowhere else.
 * `inactive` greys it out, e.g. NOW turning into OFFLINE.
 */
export function Tag({
  size = "sm",
  tone = "active",
  children,
}: {
  size?: "sm" | "md";
  tone?: "active" | "inactive";
  children: ReactNode;
}) {
  return (
    <span
      {...stylex.props(
        styles.tag,
        tone === "inactive" && styles.tagInactive,
        size === "sm" ? styles.tagSm : styles.tagMd,
      )}
    >
      {children}
    </span>
  );
}

/** Small uppercase mono label. */
export function Eyebrow({
  as: Element = "span",
  tone = "ink",
  children,
  style,
}: {
  as?: "span" | "h2" | "h3";
  tone?: "ink" | "muted";
  children: ReactNode;
  style?: StyleXStyles<{
    display?: "block";
    marginTop?: number | string;
    marginBottom?: number | string;
  }>;
}) {
  return (
    <Element {...stylex.props(styles.eyebrow, styles[tone], style)}>
      {children}
    </Element>
  );
}

/** A 1px line that fills the remaining space in a flex row. */
export function Rule() {
  return <span aria-hidden {...stylex.props(styles.rule)} />;
}

/**
 * Underline that is faint at rest and full ink on hover. `quiet` drops the
 * underline at rest, e.g. for timestamps.
 */
export function TextLink({
  href,
  rel,
  variant = "default",
  children,
}: {
  href: string;
  rel?: string;
  variant?: "default" | "quiet";
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      rel={rel}
      {...stylex.props(styles.link, variant === "quiet" && styles.linkQuiet)}
    >
      {children}
    </Link>
  );
}

/**
 * Handwritten-feeling asides: a tilted `note`, or a bordered `sticker`.
 * Part of the page's personality — keep them.
 */
export function Marginalia({
  variant = "note",
  children,
  style,
}: {
  variant?: "note" | "sticker";
  children: ReactNode;
  /** For placing the aside against its neighbours. */
  style?: StyleXStyles<{
    alignSelf?: "flex-start" | "flex-end";
    marginBottom?: number | string;
  }>;
}) {
  return <span {...stylex.props(styles[variant], style)}>{children}</span>;
}
