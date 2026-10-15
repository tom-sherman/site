"use client";

import * as stylex from "@stylexjs/stylex";
import { useActionState, useState } from "react";
import { Button, Field, Input, Message } from "../../../_components/controls";
import { type PublishThreadState, publishThreadAction } from "../actions";

const styles = stylex.create({
  form: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 16,
  },
  field: {
    alignSelf: "stretch",
  },
});

export function PublishThreadForm({
  root,
  suggestedTitle,
}: {
  /** The thread's first post. */
  root: string;
  suggestedTitle: string;
}) {
  const [state, action, pending] = useActionState<PublishThreadState, FormData>(
    publishThreadAction,
    {},
  );
  // Controlled, so a failed publish doesn't reset them.
  const [title, setTitle] = useState(suggestedTitle);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  return (
    <form action={action} {...stylex.props(styles.form)}>
      <input type="hidden" name="root" value={root} />
      <Field label="Title" style={styles.field}>
        <Input
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </Field>
      <Field
        label="Description"
        hint="Optional. Otherwise the first post stands in."
        style={styles.field}
      >
        <Input
          name="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <Field label="Tags" hint="Comma-separated." style={styles.field}>
        <Input
          name="tags"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />
      </Field>
      {state.error && <Message tone="error">{state.error}</Message>}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Publishing…" : "Publish"}
      </Button>
    </form>
  );
}
