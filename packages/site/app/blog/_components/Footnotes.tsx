import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";

const styles = stylex.create({
  ref: {
    fontFamily: fonts.mono,
    fontSize: "0.62em",
    lineHeight: 0,
    verticalAlign: "super",
  },
  refLink: {
    paddingInline: 2,
    // Linked back to, it lands partway down the screen, so the text it's
    // in (often ending with it) is in view rather than scrolled off the top.
    scrollMarginTop: "40vh",
    color: colors.ink,
    // Marks where a footnote's back link landed.
    backgroundColor: {
      default: null,
      ":target": colors.highlight,
    },
    textDecorationLine: {
      default: "none",
      ":hover": "underline",
    },
  },
  section: {
    marginTop: "1em",
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.rule,
    fontSize: fontSizes.body,
    lineHeight: 1.55,
    color: colors.subtle,
  },
  list: {
    paddingLeft: "1.3em",
  },
  footnote: {
    marginTop: "0.5em",
    paddingLeft: "0.2em",
    scrollMarginTop: 24,
    // Marks the footnote a reference jumped to.
    backgroundColor: {
      default: null,
      ":target": colors.highlight,
    },
  },
  backLink: {
    marginLeft: 6,
    color: colors.muted,
    textDecorationLine: "none",
  },
});

/**
 * Footnotes, wherever a post's format has them. Ids are the caller's: a
 * footnote's is `id`, and its first reference's is `{id}-ref`, which the
 * footnote links back to.
 */
export function FootnoteRef({
  id,
  number,
  first,
}: {
  id: string;
  number: number;
  /** Only the first reference to a footnote is linked back to. */
  first: boolean;
}) {
  return (
    <sup {...stylex.props(styles.ref)}>
      <a
        href={`#${id}`}
        id={first ? `${id}-ref` : undefined}
        aria-label={`Footnote ${number}`}
        {...stylex.props(styles.refLink)}
      >
        {number}
      </a>
    </sup>
  );
}

/** The footnotes, at the end of the post, in order. */
export function Footnotes({ children }: { children: ReactNode }) {
  return (
    <section aria-label="Footnotes" {...stylex.props(styles.section)}>
      <ol {...stylex.props(styles.list)}>{children}</ol>
    </section>
  );
}

export function Footnote({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  return (
    <li id={id} {...stylex.props(styles.footnote)}>
      {children}
    </li>
  );
}

/** Back to where the footnote `id` is first referenced. */
export function BackLink({ id }: { id: string }) {
  return (
    <a
      href={`#${id}-ref`}
      aria-label="Back to the text"
      {...stylex.props(styles.backLink)}
    >
      ↩
    </a>
  );
}
