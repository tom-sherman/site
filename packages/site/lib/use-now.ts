import { useSyncExternalStore } from "react";
import type { Timestamp } from "./data/types";

interface Clock {
  now: Timestamp;
  listeners: Set<() => void>;
  timer?: ReturnType<typeof setInterval>;
}

// One shared timer per interval, however many components are ticking.
const clocks = new Map<number, Clock>();

function getClock(intervalMs: number): Clock {
  let clock = clocks.get(intervalMs);
  if (!clock) {
    clock = { now: Date.now(), listeners: new Set() };
    clocks.set(intervalMs, clock);
  }
  return clock;
}

function subscribe(intervalMs: number, listener: () => void) {
  const clock = getClock(intervalMs);
  clock.listeners.add(listener);
  if (!clock.timer) {
    clock.now = Date.now();
    clock.timer = setInterval(() => {
      clock.now = Date.now();
      clock.listeners.forEach((l) => l());
    }, intervalMs);
  }
  return () => {
    clock.listeners.delete(listener);
    if (!clock.listeners.size) {
      clearInterval(clock.timer);
      clock.timer = undefined;
    }
  };
}

/**
 * The current time, ticking every `intervalMs`. Renders `serverNow` on the
 * server and during hydration so the markup matches, then switches to the
 * client clock.
 */
export function useNow(serverNow: Timestamp, intervalMs: number): Timestamp {
  return useSyncExternalStore(
    (listener) => subscribe(intervalMs, listener),
    () => getClock(intervalMs).now,
    () => serverNow,
  );
}
