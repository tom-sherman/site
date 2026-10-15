import type { Metadata } from "next";
import { PageHeading } from "../../../_components/PageHeading";
import { PostEditor } from "../PostEditor";

export const metadata: Metadata = { title: "New post" };

export default function NewPostPage() {
  return (
    <>
      <PageHeading title="New post" />
      <PostEditor
        post={{
          title: "",
          subtitle: "",
          markdown: "",
          slug: "",
          tags: [],
          status: "Not saved yet. Saving makes it a draft.",
        }}
      />
    </>
  );
}
