import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { colors, fonts, fontSizes } from "./tokens.stylex";

const styles = stylex.create({
  chip: {
    appearance: "none",
    cursor: "pointer",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 6,
    paddingBlock: 4,
    paddingInline: 9,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: colors.chipBorder,
      ":hover": colors.ink,
    },
    borderRadius: 0,
    backgroundColor: "transparent",
    color: colors.ink,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    lineHeight: "inherit",
  },
  active: {
    borderColor: colors.ink,
    backgroundColor: colors.ink,
    color: colors.page,
  },
  count: {
    opacity: 0.55,
  },
});

export function Chip({
  active = false,
  glyph,
  count,
  onClick,
  children,
}: {
  active?: boolean;
  glyph?: string;
  count?: number;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      {...stylex.props(styles.chip, active && styles.active)}
    >
      {glyph && <span aria-hidden>{glyph}</span>}
      <span>{children}</span>
      {count !== undefined && (
        <span {...stylex.props(styles.count)}>{count}</span>
      )}
    </button>
  );
}
