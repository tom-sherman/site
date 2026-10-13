import { connection } from "next/server";
import { getNowStatus } from "@/lib/data/now";
import type { Timestamp } from "@/lib/data/types";
import { NowBarView } from "./NowBarView";

export async function NowBar({
  lastActivityAt,
}: {
  /** When the newest feed item was published, if there is one. */
  lastActivityAt: Timestamp | null;
}) {
  await connection();
  const status = await getNowStatus();
  // Read per request, not inside the cached status, so the server-rendered
  // timer is current and doesn't jump when the client clock takes over. A
  // server component renders once per request, so this can't drift.
  // oxlint-disable-next-line react/purity
  const renderedAt = Date.now();
  return (
    <NowBarView
      status={status}
      lastActivityAt={lastActivityAt}
      renderedAt={renderedAt}
    />
  );
}
