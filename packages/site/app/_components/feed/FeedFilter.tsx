"use client";

import { Activity, createContext, use, type ReactNode } from "react";
import type { FeedCategory } from "@/lib/feed";

export type Filter = FeedCategory | "all";

export const FilterContext = createContext<Filter>("all");

export function matchesFilter(
  filter: Filter,
  categories: readonly FeedCategory[],
): boolean {
  return filter === "all" || categories.includes(filter);
}

/**
 * Shows its children while the feed's filter is one of `categories`, and
 * hides them otherwise without unmounting, so their state survives.
 */
export function ShownFor({
  categories,
  children,
}: {
  categories: readonly FeedCategory[];
  children: ReactNode;
}) {
  const filter = use(FilterContext);
  return (
    <Activity mode={matchesFilter(filter, categories) ? "visible" : "hidden"}>
      {children}
    </Activity>
  );
}

/** Whichever of `views` is for the feed's current filter. */
export function FilterSwitch({
  views,
}: {
  views: Partial<Record<Filter, ReactNode>>;
}) {
  return views[use(FilterContext)];
}
