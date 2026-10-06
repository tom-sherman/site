import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { Container } from "@/lib/components/Container";
import {
  colors,
  fonts,
  fontSizes,
  layout,
} from "@/lib/components/tokens.stylex";

const styles = stylex.create({
  bar: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    backgroundColor: colors.ink,
    color: colors.onInk,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
  },
  inner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    height: layout.nowBarHeight,
  },
});

/** The dark strip the Now bar sits in. Rendered empty while its data streams in. */
export function NowBarShell({ children }: { children?: ReactNode }) {
  return (
    <section aria-label="What Tom is doing now" {...stylex.props(styles.bar)}>
      <Container style={styles.inner}>{children}</Container>
    </section>
  );
}
