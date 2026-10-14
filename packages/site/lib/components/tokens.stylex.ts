import * as stylex from "@stylexjs/stylex";

// Warm neutrals (hue 95) with a single lime accent. The accent is reserved for
// the NOW tag, the progress fill, the PINNED tag, the cycle-button hover and
// Tom's avatar fallback — don't spread it further.
export const colors = stylex.defineVars({
  page: "oklch(0.962 0.007 95)",
  surface: "oklch(0.998 0.002 95)",
  ink: "oklch(0.2 0.012 95)",
  onInk: "oklch(0.96 0.006 95)",
  body: "oklch(0.35 0.012 95)",
  subtle: "oklch(0.45 0.012 95)",
  muted: "oklch(0.57 0.01 95)",
  lowMarker: "oklch(0.6 0.012 95)",
  underline: "oklch(0.75 0.01 95)",
  dashedRule: "oklch(0.8 0.01 95)",
  chipBorder: "oklch(0.85 0.01 95)",
  cardBorder: "oklch(0.885 0.008 95)",
  rule: "oklch(0.915 0.007 95)",
  hoverTint: "oklch(0.95 0.008 95)",
  inkBorder: "oklch(0.4 0.012 95)",
  progressTrack: "oklch(0.38 0.012 95)",
  accent: "oklch(0.88 0.19 125)",
  // Highlighted text in posts. A soft warm yellow, so it doesn't read as the accent.
  highlight: "oklch(0.93 0.07 95)",
  // The same yellow, paler, behind a whole block: a post a link landed on.
  highlightWash: "oklch(0.955 0.035 95)",
});

export const fonts = stylex.defineVars({
  sans: "var(--font-geist), system-ui, sans-serif",
  serif: "var(--font-instrument-serif), serif",
  mono: "var(--font-martian-mono), monospace",
});

export const fontSizes = stylex.defineVars({
  // Mono microcopy: timestamps, meta, card headers.
  micro: "10.5px",
  // Mono labels: chips, tags, links, footer.
  label: "11px",
  body: "15.5px",
});

export const shadows = stylex.defineVars({
  card: "0 1px 2px oklch(0.2 0.02 95 / .04), 0 18px 40px -24px oklch(0.2 0.02 95 / .3)",
});

export const layout = stylex.defineVars({
  contentWidth: "1240px",
  pagePadding: "clamp(10px, 2.5vw, 20px)",
  nowBarHeight: "40px",
  // Wide enough for a T-minus stamp with two-digit days (`T−12d03h`).
  timelineTime: {
    default: "68px",
    "@media (max-width: 639.98px)": "64px",
  },
  timelineRail: {
    default: "28px",
    "@media (max-width: 639.98px)": "20px",
  },
});

export const breakpoints = stylex.defineConsts({
  phone: "@media (max-width: 639.98px)",
  wide: "@media (min-width: 960px)",
});
