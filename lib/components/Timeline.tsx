import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { colors, fonts, fontSizes, layout } from "./tokens.stylex";

const styles = stylex.create({
  row: {
    display: "grid",
    gridTemplateColumns: `${layout.timelineTime} ${layout.timelineRail} minmax(0, 1fr)`,
  },
  heading: {
    alignItems: "center",
    paddingTop: 56,
    paddingBottom: 18,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  headingGutter: {
    fontSize: fontSizes.label,
  },
  gutter: {
    textAlign: "right",
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    fontVariantNumeric: "tabular-nums",
    color: colors.muted,
  },
  rail: {
    position: "relative",
    display: "flex",
    justifyContent: "center",
  },
  line: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: "50%",
    width: 1,
    backgroundColor: colors.rule,
  },
  content: {
    minWidth: 0,
  },
  marker: {
    position: "relative",
    boxSizing: "content-box",
  },
  // Paired top offsets keep the timestamp, the marker and the first line of
  // content on one horizontal line.
  diamondGutter: { paddingTop: 15 },
  diamond: {
    marginTop: 16,
    width: 9,
    height: 9,
    backgroundColor: colors.ink,
    transform: "rotate(45deg)",
    // A ring of page colour so the line appears to break.
    outlineWidth: 4,
    outlineStyle: "solid",
    outlineColor: colors.page,
  },
  ringGutter: { paddingTop: 11 },
  ring: {
    marginTop: 14,
    width: 7,
    height: 7,
    borderRadius: "50%",
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: colors.ink,
    backgroundColor: colors.page,
  },
  dotGutter: { paddingTop: 9 },
  dot: {
    marginTop: 12,
    width: 5,
    height: 5,
    borderRadius: "50%",
    backgroundColor: colors.lowMarker,
  },
});

/** Diamond for high priority, hollow ring for medium, grey dot for low. */
export type Marker = "diamond" | "ring" | "dot";

const gutterOffsets = {
  diamond: styles.diamondGutter,
  ring: styles.ringGutter,
  dot: styles.dotGutter,
};

/**
 * One row of the timeline grid: timestamp gutter · rail · content. `entry`
 * rows draw a continuous vertical line through the rail unless `line` is off;
 * `heading` rows (day headers) break it.
 */
export function TimelineRow({
  variant = "entry",
  gutter,
  marker,
  rail,
  line = variant === "entry",
  children,
  style,
}: {
  variant?: "entry" | "heading";
  gutter?: ReactNode;
  marker?: Marker;
  /** Custom rail content, in place of a marker. */
  rail?: ReactNode;
  line?: boolean;
  children: ReactNode;
  style?: StyleXStyles<{
    paddingTop?: number | string;
    fontFamily?: string;
    fontSize?: number | string;
    color?: string;
  }>;
}) {
  const heading = variant === "heading";
  return (
    <div {...stylex.props(styles.row, heading && styles.heading, style)}>
      <div
        {...stylex.props(
          styles.gutter,
          heading && styles.headingGutter,
          marker && gutterOffsets[marker],
        )}
      >
        {gutter}
      </div>
      <div {...stylex.props(styles.rail)}>
        {line && <span aria-hidden {...stylex.props(styles.line)} />}
        {marker && (
          <span aria-hidden {...stylex.props(styles.marker, styles[marker])} />
        )}
        {rail}
      </div>
      <div {...stylex.props(styles.content)}>{children}</div>
    </div>
  );
}
