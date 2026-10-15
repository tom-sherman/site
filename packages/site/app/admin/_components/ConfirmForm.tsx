"use client";

import type { ReactNode } from "react";

/** A form that asks before it submits, for things that are hard to undo. */
export function ConfirmForm({
  action,
  message,
  children,
}: {
  action: (form: FormData) => Promise<void>;
  message: string;
  children: ReactNode;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
