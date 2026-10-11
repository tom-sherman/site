"use client";

import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import Cal, { getCalApi } from "@calcom/embed-react";
import { useEffect, useState } from "react";
import { breakpoints, colors } from "@/lib/components/tokens.stylex";

const pulse = stylex.keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.5 },
});

const styles = stylex.create({
  // The skeleton and the embed share one grid cell, so the skeleton covers
  // the embed's blank iframe until Cal says it has rendered.
  stack: {
    display: "grid",
    isolation: "isolate",
  },
  layer: {
    gridArea: "1 / 1",
    minWidth: 0,
  },
  // Cal's own loader sits at `z-index: 999999999999`; keep it (and the rest
  // of Cal's stacking) inside the embed so the skeleton can cover it.
  embed: {
    isolation: "isolate",
  },
  skeleton: {
    zIndex: 1,
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr)",
      [breakpoints.wide]: "240px minmax(0, 1fr) 220px",
    },
    gap: 32,
    alignSelf: "start",
    width: "100%",
    maxWidth: 1000,
    marginInline: "auto",
    padding: 24,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.cardBorder,
    borderRadius: 8,
    // Opaque, and never faded by the pulse, so nothing in the embed shows
    // through.
    backgroundColor: colors.surface,
  },
  column: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  slots: {
    display: {
      default: "none",
      [breakpoints.wide]: "flex",
    },
  },
  block: {
    borderRadius: 4,
    backgroundColor: colors.rule,
    animationName: {
      default: pulse,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "1.6s",
    animationIterationCount: "infinite",
    animationTimingFunction: "ease-in-out",
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: "50%",
  },
  days: {
    display: "grid",
    gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
    gap: 6,
  },
  day: {
    aspectRatio: "1",
  },
  slot: {
    height: 40,
  },
  name: { width: "40%", height: 12 },
  title: { width: "70%", height: 20 },
  line: { width: "85%", height: 12 },
  short: { width: "50%", height: 12 },
  month: { width: "30%", height: 16 },
  slotsHeading: { width: "60%", height: 12 },
});

// Cal's booker runs in an iframe, out of reach of our StyleX vars, so these
// mirror the values in tokens.stylex.ts. Keep them in step.
const calColors = {
  "cal-bg": "oklch(0.998 0.002 95)", // surface
  "cal-bg-subtle": "oklch(0.95 0.008 95)", // hoverTint
  "cal-bg-muted": "oklch(0.962 0.007 95)", // page
  // Available days: the same grey as the skeleton's blocks.
  "cal-bg-emphasis": "oklch(0.915 0.007 95)", // rule
  "cal-bg-inverted": "oklch(0.2 0.012 95)", // ink
  "cal-text-emphasis": "oklch(0.2 0.012 95)", // ink
  "cal-text": "oklch(0.35 0.012 95)", // body
  "cal-text-subtle": "oklch(0.45 0.012 95)", // subtle
  "cal-text-muted": "oklch(0.57 0.01 95)", // muted
  "cal-text-inverted": "oklch(0.96 0.006 95)", // onInk
  "cal-border-emphasis": "oklch(0.75 0.01 95)", // underline
  "cal-border": "oklch(0.85 0.01 95)", // chipBorder
  "cal-border-subtle": "oklch(0.885 0.008 95)", // cardBorder
  "cal-border-booker": "oklch(0.885 0.008 95)", // cardBorder
  "cal-border-muted": "oklch(0.915 0.007 95)", // rule
  // Selected day and buttons. Ink rather than the accent, which is reserved.
  "cal-brand": "oklch(0.2 0.012 95)", // ink
  "cal-brand-emphasis": "oklch(0.35 0.012 95)", // body
  "cal-brand-text": "oklch(0.96 0.006 95)", // onInk
};

export function CalEmbed() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const done = () => setReady(true);
    const api = getCalApi().then((cal) => {
      // The theme is pinned to light, so dark never applies.
      cal("ui", { cssVarsPerTheme: { light: calColors, dark: calColors } });
      cal("on", { action: "linkReady", callback: done });
      // Don't leave the skeleton up forever; Cal shows its own error.
      cal("on", { action: "linkFailed", callback: done });
      return cal;
    });
    return () => {
      void api.then((cal) => {
        cal("off", { action: "linkReady", callback: done });
        cal("off", { action: "linkFailed", callback: done });
      });
    };
  }, []);

  return (
    <div {...stylex.props(styles.stack)}>
      <Cal
        calLink="tom-sherman/30min"
        // The page has no dark mode, so don't follow the OS into one.
        config={{ theme: "light" }}
        {...stylex.props(styles.layer, styles.embed)}
      />
      {!ready && <CalSkeleton />}
    </div>
  );
}

/** A rough outline of Cal's booker: event details, month grid, time slots. */
function CalSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading calendar"
      {...stylex.props(styles.layer, styles.skeleton)}
    >
      <div {...stylex.props(styles.column)}>
        <Block style={styles.avatar} />
        <Block style={styles.name} />
        <Block style={styles.title} />
        <Block style={styles.line} />
        <Block style={styles.short} />
      </div>
      <div {...stylex.props(styles.column)}>
        <Block style={styles.month} />
        <div {...stylex.props(styles.days)}>
          {Array.from({ length: 35 }, (_, i) => (
            <Block key={i} style={styles.day} />
          ))}
        </div>
      </div>
      <div {...stylex.props(styles.column, styles.slots)}>
        <Block style={styles.slotsHeading} />
        {Array.from({ length: 6 }, (_, i) => (
          <Block key={i} style={styles.slot} />
        ))}
      </div>
    </div>
  );
}

function Block({ style }: { style: StyleXStyles }) {
  return <span {...stylex.props(styles.block, style)} />;
}
