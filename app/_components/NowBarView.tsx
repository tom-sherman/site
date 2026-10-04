"use client";

import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { Artwork } from "@/lib/components/Artwork";
import { RelativeTime } from "@/lib/components/RelativeTime";
import { Tag } from "@/lib/components/Text";
import { breakpoints, colors } from "@/lib/components/tokens.stylex";
import type { NowActivity, NowStatus } from "@/lib/data/now";
import { GLYPHS } from "@/lib/feed";
import { formatClock, formatMinutes } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { NowBarShell } from "./NowBarShell";

const pulse = stylex.keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.2 },
});

const styles = stylex.create({
  dot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    backgroundColor: colors.ink,
  },
  pulsing: {
    animationName: {
      default: pulse,
      "@media (prefers-reduced-motion: reduce)": "none",
    },
    animationDuration: "1.4s",
    animationTimingFunction: "ease-in-out",
    animationIterationCount: "infinite",
  },
  art: {
    width: 22,
    height: 22,
  },
  activity: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 64,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  dim: {
    opacity: 0.55,
  },
  title: {
    fontWeight: 500,
  },
  track: {
    display: {
      default: "block",
      [breakpoints.phone]: "none",
    },
    position: "relative",
    flexShrink: 0,
    width: 72,
    height: 3,
    backgroundColor: colors.progressTrack,
  },
  fill: {
    position: "absolute",
    inset: 0,
    backgroundColor: colors.accent,
    transformOrigin: "left",
  },
  progress: (fraction: number) => ({
    transform: `scaleX(${fraction})`,
  }),
  elapsed: {
    flexShrink: 0,
    opacity: 0.7,
    fontVariantNumeric: "tabular-nums",
  },
  total: {
    display: {
      default: "inline",
      [breakpoints.phone]: "none",
    },
  },
  cycle: {
    appearance: "none",
    cursor: "pointer",
    flexShrink: 0,
    paddingBlock: 2,
    paddingInline: 7,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: colors.inkBorder,
      ":hover": colors.accent,
    },
    borderRadius: 0,
    backgroundColor: "transparent",
    color: {
      default: "inherit",
      ":hover": colors.accent,
    },
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
  },
});

const VERBS: Record<NowActivity["kind"], string> = {
  listening: "Listening to",
  playing: "Playing",
};

export function NowBarView({ status }: { status: NowStatus }) {
  const [index, setIndex] = useState(0);
  const now = useNow(status.lastSeenAt, 1000);
  const { activities } = status;

  if (!activities.length) {
    return (
      <NowBarShell>
        <Tag size="md">
          <span {...stylex.props(styles.dot)} />
          Now
        </Tag>
        <span {...stylex.props(styles.activity)}>
          <span {...stylex.props(styles.dim)}>Offline — last seen </span>
          <RelativeTime
            timestamp={status.lastSeenAt}
            asOf={status.lastSeenAt}
          />
        </span>
      </NowBarShell>
    );
  }

  const activity = activities[index % activities.length];
  const elapsed = Math.max(0, Math.floor((now - activity.startedAt) / 1000));
  const duration = activity.durationSeconds;

  return (
    <NowBarShell>
      <Tag size="md">
        <span {...stylex.props(styles.dot, styles.pulsing)} />
        Now
      </Tag>
      <Artwork image={activity.art} variant="cover" style={styles.art} />
      <span {...stylex.props(styles.activity)}>
        <span {...stylex.props(styles.dim)}>{VERBS[activity.kind]} </span>
        <span {...stylex.props(styles.title)}>{activity.title}</span>
        <span {...stylex.props(styles.dim)}> — {activity.subtitle}</span>
      </span>
      {duration === null ? (
        <span {...stylex.props(styles.elapsed)}>
          {formatMinutes(Math.floor(elapsed / 60))}
        </span>
      ) : (
        <>
          <span aria-hidden {...stylex.props(styles.track)}>
            <span
              {...stylex.props(
                styles.fill,
                styles.progress(Math.min(elapsed / duration, 1)),
              )}
            />
          </span>
          <span {...stylex.props(styles.elapsed)}>
            {formatClock(Math.min(elapsed, duration))}
            <span {...stylex.props(styles.total)}>
              {" "}
              / {formatClock(duration)}
            </span>
          </span>
        </>
      )}
      {activities.length > 1 && (
        <button
          type="button"
          title="Cycle current activities"
          onClick={() => setIndex(index + 1)}
          {...stylex.props(styles.cycle)}
        >
          {(index % activities.length) + 1}/{activities.length} {GLYPHS.cycle}
        </button>
      )}
    </NowBarShell>
  );
}
