"use server";

import { refresh, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { failureMessage } from "@/lib/admin/errors";
import { tags, text, untrimmed } from "@/lib/admin/form";
import {
  createDraft,
  deletePost,
  type PostInput,
  publishPost,
  savePost,
  unpublishPost,
} from "@/lib/admin/posts";
import { slugify } from "@/lib/admin/slug";
import { BLOG_TAG } from "@/lib/data/blog";

export interface EditorState {
  error?: string;
  notice?: string;
}

/**
 * Every button in the editor saves what's in it, and some then publish or
 * unpublish it too: the button's `intent`. A new post is created as a
 * draft first.
 */
export async function savePostAction(
  _previous: EditorState,
  form: FormData,
): Promise<EditorState> {
  const intent = text(form, "intent");
  const input = inputOf(form);
  if (intent === "publish" && !input.title) {
    return { error: "Give it a title before publishing it." };
  }

  let rkey = text(form, "rkey");
  const isNew = !rkey;
  try {
    rkey ||= await createDraft(input);
    if (intent === "publish") await publishPost(rkey, input);
    else if (intent === "unpublish") await unpublishPost(rkey, input);
    else if (!isNew) await savePost(rkey, input);
  } catch (error) {
    return { error: failureMessage(error) };
  }

  updateTag(BLOG_TAG);
  if (isNew) redirect(`/admin/posts/${rkey}`);
  refresh();
  return {
    notice:
      intent === "publish"
        ? "Published."
        : intent === "unpublish"
          ? "Unpublished. It's a draft again."
          : "Saved.",
  };
}

export async function deletePostAction(form: FormData): Promise<void> {
  await deletePost(text(form, "rkey"));
  updateTag(BLOG_TAG);
  redirect("/admin/posts");
}

function inputOf(form: FormData): PostInput {
  return {
    title: text(form, "title"),
    subtitle: text(form, "subtitle"),
    // Forms send textareas' line breaks as CRLF.
    markdown: untrimmed(form, "markdown").replaceAll("\r\n", "\n"),
    slug: slugify(text(form, "slug")),
    tags: tags(form),
  };
}
