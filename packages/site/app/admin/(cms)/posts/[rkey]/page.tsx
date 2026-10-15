import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { type AdminPost, getAdminPost } from "@/lib/admin/posts";
import { formatLongDate } from "@/lib/time";
import { PageHeading } from "../../../_components/PageHeading";
import { type EditorPost, PostEditor } from "../PostEditor";

export const metadata: Metadata = { title: "Edit post" };

export default async function EditPostPage({
  params,
}: PageProps<"/admin/posts/[rkey]">) {
  const { rkey } = await params;
  const post = await getAdminPost(rkey);
  if (!post) notFound();
  return (
    <>
      <PageHeading title={post.title || "Untitled"} />
      <PostEditor post={toEditorPost(post)} />
    </>
  );
}

function toEditorPost(post: AdminPost): EditorPost {
  const { published } = post;
  return {
    rkey: post.rkey,
    title: post.title,
    subtitle: post.subtitle,
    markdown: post.markdown,
    slug: published?.slug ?? "",
    tags: published?.tags ?? [],
    path: published?.path,
    status: published
      ? `Published ${formatLongDate(published.publishedAt)}.`
      : post.createdAt
        ? `Draft, started ${formatLongDate(post.createdAt)}.`
        : "Draft.",
  };
}
