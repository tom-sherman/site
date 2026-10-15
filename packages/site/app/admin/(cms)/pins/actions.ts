"use server";

import { refresh, updateTag } from "next/cache";
import { text } from "@/lib/admin/form";
import { editPins, type PinEdit } from "@/lib/admin/pins";
import { PINNED_TAG } from "@/lib/data/pinned";

const OPS = new Set<PinEdit["op"]>(["add", "remove", "up", "down", "hero"]);

/** One change to the pins: the button's `op`, on the pin `uri`. */
export async function editPinsAction(form: FormData): Promise<void> {
  const op = text(form, "op") as PinEdit["op"];
  const uri = text(form, "uri");
  if (!OPS.has(op) || !uri) return;
  await editPins({ op, uri });
  updateTag(PINNED_TAG);
  refresh();
}
