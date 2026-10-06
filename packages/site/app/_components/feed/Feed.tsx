"use client";

import * as stylex from "@stylexjs/stylex";
import { useState } from "react";
import { Chip } from "@/lib/components/Chip";
import { RelativeTime } from "@/lib/components/RelativeTime";
import { Rule, TextLink } from "@/lib/components/Text";
import { TimelineRow } from "@/lib/components/Timeline";
import {
  breakpoints,
  colors,
  fonts,
  fontSizes,
  layout,
} from "@/lib/components/tokens.stylex";
import type { FeedItem } from "@/lib/data/feed";
import type { Timestamp } from "@/lib/data/types";
import {
  CATEGORIES,
  categoryOf,
  GLYPHS,
  isHighPriority,
  isMediumPriority,
  type FeedCategory,
  type HighPriorityItem,
  type MediumPriorityItem,
} from "@/lib/feed";
import { dayNumber, formatDayLabel, formatShortDate } from "@/lib/time";
import { useNow } from "@/lib/use-now";
import { HighCard } from "./HighCard";
import { LowSummary } from "./LowSummary";
import { MediumRow } from "./MediumRow";

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
  older: {
    paddingTop: 20,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    color: colors.muted,
  },
});

type Filter = FeedCategory | "all";

type Entry =
  | { type: "high"; item: HighPriorityItem }
  | { type: "medium"; item: MediumPriorityItem }
  | { type: "low"; items: FeedItem[] };

interface Day {
  day: number;
  items: FeedItem[];
  entries: Entry[];
}

export function Feed({
  items,
  asOf,
  olderHref,
}: {
  /** Newest first. */
  items: FeedItem[];
  asOf: Timestamp;
  olderHref: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  // Keyed by day so a group stays open across filter changes.
  const [openDays, setOpenDays] = useState<Record<number, boolean>>({});
  const now = useNow(asOf, 60_000);

  const visible =
    filter === "all" ? items : items.filter((i) => categoryOf(i) === filter);
  const days = groupByDay(visible);

  return (
    <section aria-label="Activity feed">
      <div {...stylex.props(styles.filters)}>
        <Chip
          glyph={GLYPHS.all}
          count={items.length}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        >
          All
        </Chip>
        {CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            glyph={c.glyph}
            count={items.filter((i) => categoryOf(i) === c.id).length}
            active={filter === c.id}
            onClick={() => setFilter(c.id)}
          >
            {c.label}
          </Chip>
        ))}
      </div>

      {days.map(({ day, items: dayItems, entries }) => (
        <div key={day}>
          <TimelineRow
            variant="heading"
            gutter={formatShortDate(dayItems[0].publishedAt)}
          >
            <div {...stylex.props(styles.dayTitle)}>
              {/* Depends on the current time; see RelativeTime. */}
              <h2 suppressHydrationWarning {...stylex.props(styles.dayLabel)}>
                {formatDayLabel(day, now)}
              </h2>
              <Rule />
              <span {...stylex.props(styles.dayCount)}>
                {dayItems.length} {dayItems.length === 1 ? "thing" : "things"}
              </span>
            </div>
          </TimelineRow>

          {entries.map((entry) => {
            switch (entry.type) {
              case "high":
                return (
                  <TimelineRow
                    key={entry.item.id}
                    marker="diamond"
                    gutter={
                      <RelativeTime
                        timestamp={entry.item.publishedAt}
                        asOf={asOf}
                      />
                    }
                  >
                    <HighCard item={entry.item} />
                  </TimelineRow>
                );
              case "medium":
                return (
                  <TimelineRow
                    key={entry.item.id}
                    marker="ring"
                    gutter={
                      <RelativeTime
                        timestamp={entry.item.publishedAt}
                        asOf={asOf}
                      />
                    }
                  >
                    <MediumRow item={entry.item} />
                  </TimelineRow>
                );
              case "low":
                return (
                  <TimelineRow
                    key={`low-${day}`}
                    marker="dot"
                    gutter={
                      <RelativeTime
                        timestamp={entry.items[0].publishedAt}
                        asOf={asOf}
                      />
                    }
                  >
                    <LowSummary
                      items={entry.items}
                      open={!!openDays[day]}
                      onToggle={() =>
                        setOpenDays({ ...openDays, [day]: !openDays[day] })
                      }
                      asOf={asOf}
                    />
                  </TimelineRow>
                );
            }
          })}
        </div>
      ))}

      {olderHref && (
        <TimelineRow line={false} rail="⋮" style={styles.older}>
          <TextLink href={olderHref}>load older →</TextLink>
        </TimelineRow>
      )}
    </section>
  );
}

/**
 * Groups items by calendar day. Within a day, high and medium items stand
 * alone; low items collapse into one entry placed at the newest of them.
 */
function groupByDay(items: FeedItem[]): Day[] {
  const days = new Map<number, FeedItem[]>();
  for (const item of items) {
    const day = dayNumber(item.publishedAt);
    days.set(day, [...(days.get(day) ?? []), item]);
  }

  return [...days].map(([day, dayItems]) => {
    const entries: Entry[] = [];
    const lows: FeedItem[] = [];
    for (const item of dayItems) {
      if (isHighPriority(item)) {
        entries.push({ type: "high", item });
      } else if (isMediumPriority(item)) {
        entries.push({ type: "medium", item });
      } else {
        // The first low item is the newest, so the group goes where it would.
        if (!lows.length) entries.push({ type: "low", items: lows });
        lows.push(item);
      }
    }
    return { day, items: dayItems, entries };
  });
}
