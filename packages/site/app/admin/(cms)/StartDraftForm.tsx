"use client";

import * as stylex from "@stylexjs/stylex";
import { useActionState, useState } from "react";
import { Button, Input, Message } from "../_components/controls";
import { type EditorState, savePostAction } from "./posts/actions";

const styles = stylex.create({
  form: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    maxWidth: 640,
  },
  title: {
    flexGrow: 1,
    flexBasis: 280,
  },
});

/** A title, and straight into the editor with a new draft. */
export function StartDraftForm() {
  const [state, action, pending] = useActionState<EditorState, FormData>(
    savePostAction,
    {},
  );
  const [title, setTitle] = useState("");
  return (
    <form action={action} {...stylex.props(styles.form)}>
      <div {...stylex.props(styles.title)}>
        <Input
          name="title"
          aria-label="Title"
          placeholder="A title for a new post"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>
      <Button
        type="submit"
        name="intent"
        value="save"
        variant="primary"
        disabled={pending}
      >
        {pending ? "Starting…" : "Start a draft"}
      </Button>
      {state.error && <Message tone="error">{state.error}</Message>}
    </form>
  );
}
