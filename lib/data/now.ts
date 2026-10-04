import "server-only";
import { cacheLife } from "next/cache";
import type { ImageRef, Timestamp } from "./types";

export interface NowActivity {
  id: string;
  kind: "listening" | "playing";
  title: string;
  subtitle: string;
  art: ImageRef;
  startedAt: Timestamp;
  /** Known length in seconds (songs). `null` for open-ended activities (games). */
  durationSeconds: number | null;
}

export interface NowStatus {
  /** Concurrent activities, e.g. listening *and* playing. Empty when offline. */
  activities: NowActivity[];
  lastSeenAt: Timestamp;
}

export async function getNowStatus(): Promise<NowStatus> {
  "use cache";
  // Short-lived, so this renders at request time behind a Suspense boundary.
  cacheLife("seconds");

  const now = Date.now();
  return {
    activities: [
      {
        id: "now-track",
        kind: "listening",
        title: "Tears in the Typing Pool",
        subtitle: "Broadcast",
        art: { alt: "Tender Buttons cover art", hue: 330 },
        startedAt: now - 73_000,
        durationSeconds: 200,
      },
      {
        id: "now-game",
        kind: "playing",
        title: "Balatro",
        subtitle: "Ante 6 · Blue Stake",
        art: { alt: "Balatro cover", hue: 40 },
        startedAt: now - 3_720_000,
        durationSeconds: null,
      },
    ],
    lastSeenAt: now,
  };
}
