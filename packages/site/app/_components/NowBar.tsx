import { connection } from "next/server";
import { getNowStatus } from "@/lib/data/now";
import { NowBarView } from "./NowBarView";

export async function NowBar() {
  await connection();
  const status = await getNowStatus();
  // Read per request, not inside the cached status, so the server-rendered
  // timer is current and doesn't jump when the client clock takes over.
  return <NowBarView status={status} renderedAt={Date.now()} />;
}
