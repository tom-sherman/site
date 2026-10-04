"use client";

import type { Timestamp } from "@/lib/data/types";
import { formatDateTime, formatTimestamp } from "@/lib/time";
import { useNow } from "@/lib/use-now";

/**
 * A live-updating timestamp in the site's chosen format, with the full date
 * and time on hover. `asOf` is the server's "now", used until hydration.
 *
 * Hydration warnings are suppressed because a revalidating page can serve an
 * older static shell alongside a newer payload; the text is corrected on the
 * moment the client clock takes over either way.
 */
export function RelativeTime({
  timestamp,
  asOf,
}: {
  timestamp: Timestamp;
  asOf: Timestamp;
}) {
  const now = useNow(asOf, 30_000);
  return (
    <time
      suppressHydrationWarning
      dateTime={new Date(timestamp).toISOString()}
      title={formatDateTime(timestamp)}
    >
      {formatTimestamp(timestamp, now)}
    </time>
  );
}
