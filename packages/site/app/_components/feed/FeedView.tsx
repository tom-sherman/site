"use client";

import * as stylex from "@stylexjs/stylex";
import { Activity, useId, useRef, useState, type ReactNode } from "react";
import { Chip } from "@/lib/components/Chip";
import { Rule } from "@/lib/components/Text";
import { TimelineRow } from "@/lib/components/Timeline";
import { colors, layout, shadows } from "@/lib/components/tokens.stylex";
import type { Timestamp } from "@/lib/data/types";
import { CATEGORIES, type FeedCategory } from "@/lib/feed";
import { formatDayLabel } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { FilterContext, ShownFor, type Filter } from "./FeedFilter";

// Where the chips no longer fit on one line, with room for the counts to grow.
// A container query rather than a media query: the feed is narrowest just
// after the rail moves alongside it.
const COLLAPSED = "@container (max-width: 759.98px)";

const styles = stylex.create({
  filters: {
    position: "sticky",
    top: layout.nowBarHeight,
    zIndex: 10,
    containerType: "inline-size",
    paddingBlock: 16,
    backgroundColor: colors.page,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.rule,
  },
  chips: {
    display: {
      default: "flex",
      [COLLAPSED]: "none",
    },
    flexWrap: "wrap",
    gap: 6,
  },
  toggle: {
    display: {
      default: "none",
      [COLLAPSED]: "flex",
    },
    anchorName: "--feed-filters",
  },
  popover: {
    // Setting it outright would override the hiding of a closed popover.
    display: {
      default: null,
      ":popover-open": "flex",
    },
    flexDirection: "column",
    gap: 6,
    padding: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: colors.cardBorder,
    backgroundColor: colors.surface,
    color: colors.ink,
    boxShadow: shadows.card,
    // Without anchor positioning it stays centred, as popovers are by default.
    positionAnchor: "--feed-filters",
    positionArea: "bottom span-right",
    margin: {
      default: null,
      "@supports (position-area: bottom)": 0,
    },
    marginTop: {
      default: null,
      "@supports (position-area: bottom)": 6,
    },
  },
  dayTitle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  dayLabel: {
    fontSize: "inherit",
    fontWeight: 500,
  },
  dayCount: {
    color: colors.muted,
  },
});

/** How many items there are of each category. */
export type CategoryCounts = Partial<Record<FeedCategory, number>>;

/** One row of the timeline, rendered on the server. */
export interface FeedEntry {
  key: string;
  /** The categories of the items in it; it shows when filtering by any of them. */
  categories: FeedCategory[];
  content: ReactNode;
}

export interface FeedDay {
  /** Whole days since the epoch, as `dayNumber` gives them. */
  day: number;
  /** `04.10` */
  date: string;
  counts: CategoryCounts;
  entries: FeedEntry[];
}

/**
 * The filter chips and the days of the feed. Everything inside an entry is
 * rendered on the server; filtering hides what doesn't match rather than
 * unmounting it, so anything opened inside stays open.
 */
export function FeedView({
  days,
  counts,
  asOf,
  children,
}: {
  /** Newest first. */
  days: FeedDay[];
  counts: CategoryCounts;
  asOf: Timestamp;
  /** After the last day. */
  children?: ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const popoverId = useId();
  const popover = useRef<HTMLDivElement>(null);
  const now = useNow(asOf, 60_000);

  const options = [
    { id: "all", glyph: "all", label: "All" } as const,
    ...CATEGORIES,
  ];
  const current = options.find((o) => o.id === filter)!;

  const chips = options.map((o) => (
    <Chip
      key={o.id}
      glyph={o.glyph}
      count={countOf(counts, o.id)}
      active={filter === o.id}
      onClick={() => {
        setFilter(o.id);
        popover.current?.hidePopover();
      }}
    >
      {o.label}
    </Chip>
  ));

  return (
    <section aria-label="Activity feed">
      <div {...stylex.props(styles.filters)}>
        <div {...stylex.props(styles.chips)}>{chips}</div>

        {/* Stands in for the chips when they'd wrap. */}
        <div {...stylex.props(styles.toggle)}>
          <Chip
            glyph={current.glyph}
            count={countOf(counts, current.id)}
            popoverTarget={popoverId}
          >
            Filter: {current.label}
          </Chip>
        </div>
        <div
          ref={popover}
          id={popoverId}
          popover="auto"
          {...stylex.props(styles.popover)}
        >
          {chips}
        </div>
      </div>

      <FilterContext value={filter}>
        {days.map(({ day, date, counts: dayCounts, entries }) => {
          const count = countOf(dayCounts, filter);
          return (
            <Activity key={day} mode={count ? "visible" : "hidden"}>
              <div>
                <TimelineRow variant="heading" gutter={date}>
                  <div {...stylex.props(styles.dayTitle)}>
                    {/* Depends on the current time; see RelativeTime. */}
                    <h2
                      suppressHydrationWarning
                      {...stylex.props(styles.dayLabel)}
                    >
                      {formatDayLabel(day, now)}
                    </h2>
                    <Rule />
                    <span {...stylex.props(styles.dayCount)}>
                      {count} {count === 1 ? "thing" : "things"}
                    </span>
                  </div>
                </TimelineRow>

                {entries.map(({ key, categories, content }) => (
                  <ShownFor key={key} categories={categories}>
                    {content}
                  </ShownFor>
                ))}
              </div>
            </Activity>
          );
        })}
      </FilterContext>

      {children}
    </section>
  );
}

function countOf(counts: CategoryCounts, filter: Filter): number {
  return filter === "all"
    ? Object.values(counts).reduce((sum, n) => sum + n, 0)
    : (counts[filter] ?? 0);
}
