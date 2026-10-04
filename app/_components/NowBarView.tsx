"use client";

import * as stylex from "@stylexjs/stylex";
import { Activity, startTransition, useState, ViewTransition } from "react";
import { Artwork } from "@/lib/components/Artwork";
import { RelativeTime } from "@/lib/components/RelativeTime";
import { Tag } from "@/lib/components/Text";
import { breakpoints, colors, layout } from "@/lib/components/tokens.stylex";
import type { NowActivity, NowStatus } from "@/lib/data/now";
import { GLYPHS } from "@/lib/feed";
import { formatClock, formatMinutes } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { NowBarShell } from "./NowBarShell";

const pulse = stylex.keyframes({
  "0%, 100%": { opacity: 1 },
  "50%": { opacity: 0.2 },
});

// Activities sit on the faces of a cuboid that rolls upward. Faces dim as they
// turn away from the viewer, like light catching the edge.
const rollOut = stylex.keyframes({
  from: { transform: "rotateX(0deg)", filter: "brightness(1)" },
  to: { transform: "rotateX(90deg)", filter: "brightness(0.35)" },
});

const rollIn = stylex.keyframes({
  from: { transform: "rotateX(-90deg)", filter: "brightness(0.35)" },
  to: { transform: "rotateX(0deg)", filter: "brightness(1)" },
});

const roll = {
  // The cuboid's axis: half the face height behind the screen.
  transformOrigin: `50% 50% calc(${layout.nowBarHeight} / -2)`,
  animationDuration: "350ms",
  animationTimingFunction: "cubic-bezier(0.65, 0, 0.35, 1)",
  animationFillMode: "both",
} as const;

// Snapshots render in the top layer, outside the bar, so clip to the face's
// box (the bar's height) here. Perspective lives on the image pair so faces at
// rest render 1:1.
const rollOutClass = stylex.viewTransitionClass({
  group: { overflowY: "clip" },
  imagePair: { perspective: 500 },
  old: { ...roll, animationName: rollOut },
});

const rollInClass = stylex.viewTransitionClass({
  group: { overflowY: "clip" },
  imagePair: { perspective: 500 },
  new: { ...roll, animationName: rollIn },
});

const styles = stylex.create({
  face: {
    display: "flex",
    alignItems: "center",
    alignSelf: "stretch",
    gap: 12,
    flexGrow: 1,
    minWidth: 0,
    // Opaque so the face reads as a solid side of the cuboid mid-roll.
    backgroundColor: colors.ink,
  },
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

  const current = index % activities.length;

  return (
    <NowBarShell>
      <Tag size="md">
        <span {...stylex.props(styles.dot, styles.pulsing)} />
        Now
      </Tag>
      {activities.map((activity, i) => (
        <Activity key={activity.id} mode={i === current ? "visible" : "hidden"}>
          <ViewTransition
            enter={rollInClass}
            exit={rollOutClass}
            default="none"
          >
            <ActivityFace activity={activity} now={now} />
          </ViewTransition>
        </Activity>
      ))}
      {activities.length > 1 && (
        <button
          type="button"
          title="Cycle current activities"
          onClick={() => startTransition(() => setIndex(index + 1))}
          {...stylex.props(styles.cycle)}
        >
          {current + 1}/{activities.length} {GLYPHS.cycle}
        </button>
      )}
    </NowBarShell>
  );
}

function ActivityFace({
  activity,
  now,
}: {
  activity: NowActivity;
  now: number;
}) {
  const elapsed = Math.max(0, Math.floor((now - activity.startedAt) / 1000));
  const duration = activity.durationSeconds;

  return (
    <div {...stylex.props(styles.face)}>
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
    </div>
  );
}
