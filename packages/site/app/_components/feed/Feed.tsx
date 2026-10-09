import * as stylex from "@stylexjs/stylex";
import type { ReactNode } from "react";
import { RelativeTime } from "@/lib/components/RelativeTime";
import { TextLink } from "@/lib/components/Text";
import { TimelineRow } from "@/lib/components/Timeline";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";
import type { FeedItem } from "@/lib/data/feed";
import type { Timestamp } from "@/lib/data/types";
import {
  categoryOf,
  isHighPriority,
  isMediumPriority,
  type HighPriorityItem,
  type MediumPriorityItem,
} from "@/lib/feed";
import { dayNumber, formatShortDate } from "@/lib/time";
import { FilterSwitch, type Filter } from "./FeedFilter";
import {
  FeedView,
  type CategoryCounts,
  type FeedDay,
  type FeedEntry,
} from "./FeedView";
import { HighCard } from "./HighCard";
import { LowSummary } from "./LowSummary";
import { MediumRow } from "./MediumRow";

const styles = stylex.create({
  older: {
    paddingTop: 20,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    color: colors.muted,
  },
});

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
  return (
    <FeedView
      days={groupByDay(items, asOf)}
      counts={countByCategory(items)}
      asOf={asOf}
    >
      {olderHref && (
        <TimelineRow line={false} rail="⋮" style={styles.older}>
          <TextLink href={olderHref}>load older →</TextLink>
        </TimelineRow>
      )}
    </FeedView>
  );
}

/**
 * Groups items by calendar day. Within a day, high and medium items stand
 * alone; low items collapse into one entry placed at the newest of them.
 */
function groupByDay(items: FeedItem[], asOf: Timestamp): FeedDay[] {
  const days = new Map<number, FeedItem[]>();
  for (const item of items) {
    const day = dayNumber(item.publishedAt);
    days.set(day, [...(days.get(day) ?? []), item]);
  }

  return [...days].map(([day, dayItems]) => {
    const lows = dayItems.filter(
      (i) => !isHighPriority(i) && !isMediumPriority(i),
    );
    return {
      day,
      date: formatShortDate(dayItems[0].publishedAt),
      counts: countByCategory(dayItems),
      entries: dayItems.flatMap((item) =>
        isHighPriority(item) || isMediumPriority(item)
          ? [itemEntry(item, asOf)]
          : // The first low item is the newest, so the group goes where it would.
            item === lows[0]
            ? [lowEntry(day, lows, asOf)]
            : [],
      ),
    };
  });
}

function countByCategory(items: FeedItem[]): CategoryCounts {
  const counts: CategoryCounts = {};
  for (const item of items) {
    const category = categoryOf(item);
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return counts;
}

function itemEntry(
  item: HighPriorityItem | MediumPriorityItem,
  asOf: Timestamp,
): FeedEntry {
  return {
    key: item.id,
    categories: [categoryOf(item)],
    content: (
      <TimelineRow
        marker={isHighPriority(item) ? "diamond" : "ring"}
        gutter={
          <TextLink href={item.url} variant="quiet">
            <RelativeTime timestamp={item.publishedAt} asOf={asOf} />
          </TextLink>
        }
      >
        {isHighPriority(item) ? (
          <HighCard item={item} />
        ) : (
          <MediumRow item={item} />
        )}
      </TimelineRow>
    ),
  };
}

/**
 * A day's low items in one row. Its time is the newest item's, of those the
 * filter leaves showing.
 */
function lowEntry(day: number, items: FeedItem[], asOf: Timestamp): FeedEntry {
  const times: Partial<Record<Filter, ReactNode>> = {};
  // Newest first, so the first item seen of each category is its newest.
  for (const item of items) {
    const category = categoryOf(item);
    times.all ??= <RelativeTime timestamp={item.publishedAt} asOf={asOf} />;
    times[category] ??= (
      <RelativeTime timestamp={item.publishedAt} asOf={asOf} />
    );
  }
  return {
    key: `low-${day}`,
    categories: [...new Set(items.map(categoryOf))],
    content: (
      <TimelineRow marker="dot" gutter={<FilterSwitch views={times} />}>
        <LowSummary items={items} asOf={asOf} />
      </TimelineRow>
    ),
  };
}
