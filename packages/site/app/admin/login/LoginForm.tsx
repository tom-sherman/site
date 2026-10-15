"use client";

import * as stylex from "@stylexjs/stylex";
import { useActionState } from "react";
import { type LoginState, logInAction } from "../actions";
import { Button, Field, Input, Message } from "../_components/controls";

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

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    logInAction,
    {},
  );
  return (
    <form action={action} {...stylex.props(styles.form)}>
      <Field label="App password" style={styles.field}>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="xxxx-xxxx-xxxx-xxxx"
          required
        />
      </Field>
      {state.error && <Message tone="error">{state.error}</Message>}
      <Button type="submit" variant="primary" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
