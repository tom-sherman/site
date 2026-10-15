"use client";

import * as stylex from "@stylexjs/stylex";
import { useActionState, useEffect, useRef, useState } from "react";
import { slugify } from "@/lib/admin/slug";
import {
  breakpoints,
  colors,
  fonts,
  fontSizes,
} from "@/lib/components/tokens.stylex";
import { ConfirmForm } from "../../_components/ConfirmForm";
import {
  Button,
  Field,
  Input,
  Message,
  TextArea,
} from "../../_components/controls";
import { deletePostAction, type EditorState, savePostAction } from "./actions";

const styles = stylex.create({
  layout: {
    display: "grid",
    gridTemplateColumns: {
      default: "minmax(0, 1fr) 280px",
      [breakpoints.phone]: "minmax(0, 1fr)",
    },
    alignItems: "start",
    gap: 40,
  },
  main: {
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  markdown: {
    minHeight: "60vh",
    fontFamily: fonts.mono,
    fontSize: "13px",
  },
  aside: {
    position: {
      default: "sticky",
      [breakpoints.phone]: "static",
    },
    top: 24,
    display: "flex",
    flexDirection: "column",
    gap: 20,
  },
  status: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    lineHeight: 1.6,
    color: colors.subtle,
  },
  buttons: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  links: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
  },
  link: {
    color: colors.ink,
    textDecorationColor: colors.underline,
    textUnderlineOffset: 3,
  },
  danger: {
    marginTop: 40,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: colors.rule,
  },
});

export interface EditorPost {
  /** The entry's; absent until it's first saved. */
  rkey?: string;
  title: string;
  subtitle: string;
  markdown: string;
  slug: string;
  tags: string[];
  /** Where it is on the site, once it's published. */
  path?: string;
  /** "Draft, started 3 Oct", say. */
  status: string;
}

/**
 * A post's fields and Markdown, with its status and actions alongside.
 * Fields are controlled so a failed save doesn't reset them. ⌘S saves.
 */
export function PostEditor({ post }: { post: EditorPost }) {
  const [state, action, pending] = useActionState<EditorState, FormData>(
    savePostAction,
    {},
  );
  const [title, setTitle] = useState(post.title);
  const [subtitle, setSubtitle] = useState(post.subtitle);
  const [slug, setSlug] = useState(post.slug);
  const [tags, setTags] = useState(post.tags.join(", "));
  const [markdown, setMarkdown] = useState(post.markdown);
  const save = useRef<HTMLButtonElement>(null);
  const published = post.path !== undefined;

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "s" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      const button = save.current;
      if (button && !button.disabled) button.form?.requestSubmit(button);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <form action={action} {...stylex.props(styles.layout)}>
        {post.rkey && <input type="hidden" name="rkey" value={post.rkey} />}
        <div {...stylex.props(styles.main)}>
          <Field label="Title">
            <Input
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={500}
            />
          </Field>
          <Field label="Subtitle" hint="Also the post's description.">
            <Input
              name="subtitle"
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              maxLength={1000}
            />
          </Field>
          <Field
            label="Markdown"
            hint="Headings start at ##; the title is the #. Markdoc's {% tweet link=… /%} embeds a tweet."
          >
            <TextArea
              name="markdown"
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              spellCheck
              style={styles.markdown}
            />
          </Field>
        </div>

        <aside {...stylex.props(styles.aside)}>
          <p {...stylex.props(styles.status)}>{post.status}</p>
          {state.error && <Message tone="error">{state.error}</Message>}
          {state.notice && !pending && <Message>{state.notice}</Message>}
          <div {...stylex.props(styles.buttons)}>
            <Button
              ref={save}
              type="submit"
              name="intent"
              value="save"
              variant={published ? "primary" : "secondary"}
              disabled={pending}
            >
              {published ? "Update" : "Save draft"}
            </Button>
            {published ? (
              <Button
                type="submit"
                name="intent"
                value="unpublish"
                disabled={pending}
              >
                Unpublish
              </Button>
            ) : (
              <Button
                type="submit"
                name="intent"
                value="publish"
                variant="primary"
                disabled={pending}
              >
                Publish
              </Button>
            )}
          </div>
          <Field
            label="Slug"
            hint={`/blog/${slug || slugify(title) || "…"}-${post.rkey ?? "{rkey}"}`}
          >
            <Input
              name="slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder={slugify(title) || "from the title"}
            />
          </Field>
          <Field
            label="Tags"
            hint={
              published
                ? "Comma-separated."
                : "Comma-separated. Kept once it's published."
            }
          >
            <Input
              name="tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
            />
          </Field>
          {post.rkey && (
            <div {...stylex.props(styles.links)}>
              <a
                href={`/admin/posts/${post.rkey}/preview`}
                target="_blank"
                {...stylex.props(styles.link)}
              >
                Preview what&apos;s saved ↗
              </a>
              {post.path && (
                <a
                  href={post.path}
                  target="_blank"
                  {...stylex.props(styles.link)}
                >
                  View on the site ↗
                </a>
              )}
            </div>
          )}
        </aside>
      </form>
      {post.rkey && <DeleteForm rkey={post.rkey} published={published} />}
    </>
  );
}

function DeleteForm({ rkey, published }: { rkey: string; published: boolean }) {
  return (
    <div {...stylex.props(styles.danger)}>
      <ConfirmForm
        action={deletePostAction}
        message={
          published
            ? "Delete this post? It'll come off the blog too."
            : "Delete this draft?"
        }
      >
        <input type="hidden" name="rkey" value={rkey} />
        <Button type="submit" variant="danger">
          Delete
        </Button>
      </ConfirmForm>
    </div>
  );
}
