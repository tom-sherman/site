"use client";

import * as stylex from "@stylexjs/stylex";
import { Activity, useState, type ReactNode } from "react";
import { Chip } from "@/lib/components/Chip";
import { Rule } from "@/lib/components/Text";
import { TimelineRow } from "@/lib/components/Timeline";
import { breakpoints, colors, layout } from "@/lib/components/tokens.stylex";
import type { Timestamp } from "@/lib/data/types";
import { CATEGORIES, type FeedCategory } from "@/lib/feed";
import { formatDayLabel } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { FilterContext, ShownFor, type Filter } from "./FeedFilter";

const styles = stylex.create({
  filters: {
    position: "sticky",
    top: layout.nowBarHeight,
    zIndex: 10,
    display: "flex",
    flexWrap: {
      default: "wrap",
      [breakpoints.phone]: "nowrap",
    },
    gap: 6,
    overflowX: "auto",
    scrollbarWidth: "none",
    paddingBlock: 16,
    backgroundColor: colors.page,
    borderBottomWidth: 1,
    borderBottomStyle: "solid",
    borderBottomColor: colors.rule,
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
  const now = useNow(asOf, 60_000);

  return (
    <section aria-label="Activity feed">
      <div {...stylex.props(styles.filters)}>
        <Chip
          glyph="all"
          count={countOf(counts, "all")}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        >
          All
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            glyph={c.glyph}
            count={countOf(counts, c.id)}
            active={filter === c.id}
            onClick={() => setFilter(c.id)}
          >
            {c.label}
          </Chip>
        ))}
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
