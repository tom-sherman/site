import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { colors, fonts } from "@/lib/components/tokens.stylex";

const styles = stylex.create({
  heading: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    rowGap: 16,
    columnGap: 24,
    marginBottom: 32,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: "clamp(40px, 6vw, 64px)",
    fontWeight: 400,
    lineHeight: 1,
    letterSpacing: "-0.02em",
    color: colors.ink,
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
});

/** A CMS page's title, with its main actions alongside. */
export function PageHeading({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div {...stylex.props(styles.heading)}>
      <h1 {...stylex.props(styles.title)}>{title}</h1>
      {children && <div {...stylex.props(styles.actions)}>{children}</div>}
    </div>
  );
}
