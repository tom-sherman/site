import type { Timestamp } from "./data/types";

/**
 * Days and clock times are Tom's, not the viewer's. Pinning the zone also keeps
 * server- and client-rendered output identical.
 */
export const TIME_ZONE = "Europe/London";

export type TimestampFormat = "relative" | "tminus" | "absolute";

/** `12m ago`, `T−03:14` or `14:32`. Relative is the launch choice. */
export const TIMESTAMP_FORMAT: TimestampFormat = "tminus";

const M = 60_000;
const H = 60 * M;
const D = 24 * H;

const pad = (n: number) => String(n).padStart(2, "0");

export function formatTimestamp(
  ts: Timestamp,
  now: Timestamp,
  format: TimestampFormat = TIMESTAMP_FORMAT,
): string {
  const d = Math.max(0, now - ts);
  switch (format) {
    case "absolute": {
      const { hour, minute } = zonedParts(ts);
      return `${pad(hour)}:${pad(minute)}`;
    }
    case "tminus":
      return d < D
        ? `T−${pad(Math.floor(d / H))}:${pad(Math.floor((d % H) / M))}`
        : `T−${Math.floor(d / D)}d${pad(Math.floor((d % D) / H))}h`;
    case "relative":
      if (d < H) return `${Math.max(1, Math.floor(d / M))}m ago`;
      if (d < D) return `${Math.floor(d / H)}h ago`;
      return `${Math.floor(d / D)}d ago`;
  }
}

/** `04.10.2026, 14:32`. Built from numeric parts so Node and browser ICU data can't disagree. */
export function formatDateTime(ts: Timestamp): string {
  const { year, month, day, hour, minute } = zonedParts(ts);
  return `${pad(day)}.${pad(month)}.${year}, ${pad(hour)}:${pad(minute)}`;
}

/** `04.10` */
export function formatShortDate(ts: Timestamp): string {
  const { month, day } = zonedParts(ts);
  return `${pad(day)}.${pad(month)}`;
}

/** `2026` */
export function formatYear(ts: Timestamp): string {
  return String(zonedParts(ts).year);
}

/** Whole days since the epoch for the calendar day `ts` falls on in {@link TIME_ZONE}. */
export function dayNumber(ts: Timestamp): number {
  const { year, month, day } = zonedParts(ts);
  return Date.UTC(year, month - 1, day) / D;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** `Today`, `Yesterday` or `Thu, 3 days ago`. */
export function formatDayLabel(day: number, now: Timestamp): string {
  const diff = dayNumber(now) - day;
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return `${WEEKDAYS[new Date(day * D).getUTCDay()]}, ${diff} days ago`;
}

/** `2h 14m` or `48m`. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  return h ? `${h}h ${pad(minutes % 60)}m` : `${minutes}m`;
}

/** `1:13` */
export function formatClock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;
}

const partsFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

function zonedParts(ts: Timestamp) {
  const parts: Record<string, number> = {};
  for (const { type, value } of partsFormatter.formatToParts(ts)) {
    if (type !== "literal") parts[type] = Number(value);
  }
  return parts as Record<"year" | "month" | "day" | "hour" | "minute", number>;
}
