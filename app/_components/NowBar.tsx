import { getNowStatus } from "@/lib/data/now";
import { NowBarView } from "./NowBarView";

export async function NowBar() {
  const status = await getNowStatus();
  return <NowBarView status={status} />;
}
