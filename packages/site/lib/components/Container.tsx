import * as stylex from "@stylexjs/stylex";
import type { StyleXStylesWithout } from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { layout } from "./tokens.stylex";

const styles = stylex.create({
  container: {
    width: "100%",
    maxWidth: layout.contentWidth,
    marginInline: "auto",
    paddingInline: layout.pagePadding,
  },
});

/** The 1240px content column every band of the page sits in. */
export function Container({
  as: Element = "div",
  children,
  style,
}: {
  as?: "div" | "header" | "main" | "footer";
  children: ReactNode;
  /** Layout for the column's contents. The column's own width and gutters are fixed. */
  style?: StyleXStylesWithout<{
    width: number | string;
    maxWidth: number | string;
    marginInline: number | string;
    paddingInline: number | string;
  }>;
}) {
  return (
    <Element {...stylex.props(styles.container, style)}>{children}</Element>
  );
}
