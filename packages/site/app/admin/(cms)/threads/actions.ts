"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { failureMessage } from "@/lib/admin/errors";
import { tags, text } from "@/lib/admin/form";
import {
  publishThread,
  ThreadError,
  unpublishThread,
} from "@/lib/admin/threads";
import { BLOG_TAG } from "@/lib/data/blog";

export interface PublishThreadState {
  error?: string;
}

export async function publishThreadAction(
  _previous: PublishThreadState,
  form: FormData,
): Promise<PublishThreadState> {
  const title = text(form, "title");
  if (!title) return { error: "Give it a title." };
  try {
    await publishThread(text(form, "root"), {
      title,
      description: text(form, "description"),
      tags: tags(form),
    });
  } catch (error) {
    return {
      error:
        error instanceof ThreadError ? error.message : failureMessage(error),
    };
  }
  updateTag(BLOG_TAG);
  redirect("/admin/threads");
}

export async function unpublishThreadAction(form: FormData): Promise<void> {
  await unpublishThread(text(form, "rkey"));
  updateTag(BLOG_TAG);
  refresh();
}
