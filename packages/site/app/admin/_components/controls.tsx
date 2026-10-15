import * as stylex from "@stylexjs/stylex";
import type { StyleXStyles } from "@stylexjs/stylex";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { colors, fonts, fontSizes } from "@/lib/components/tokens.stylex";

/** The CMS's buttons, fields and messages: square, mono, ink on paper. */

const styles = stylex.create({
  button: {
    appearance: "none",
    cursor: {
      default: "pointer",
      ":disabled": "default",
    },
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingBlock: 7,
    paddingInline: 12,
    borderWidth: 1,
    borderStyle: "solid",
    borderRadius: 0,
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    lineHeight: 1.4,
    textDecoration: "none",
    whiteSpace: "nowrap",
    opacity: {
      default: 1,
      ":disabled": 0.6,
    },
  },
  primary: {
    borderColor: colors.ink,
    backgroundColor: {
      default: colors.ink,
      ":hover": colors.inkBorder,
    },
    color: colors.onInk,
  },
  secondary: {
    borderColor: {
      default: colors.chipBorder,
      ":hover": colors.ink,
    },
    backgroundColor: "transparent",
    color: colors.ink,
  },
  // Quiet until hovered, then unmistakably destructive.
  danger: {
    borderColor: {
      default: colors.chipBorder,
      ":hover": "oklch(0.55 0.2 27)",
    },
    backgroundColor: "transparent",
    color: {
      default: colors.ink,
      ":hover": "oklch(0.5 0.2 27)",
    },
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  label: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    color: colors.subtle,
  },
  hint: {
    fontFamily: fonts.mono,
    fontSize: fontSizes.micro,
    color: colors.muted,
  },
  input: {
    width: "100%",
    paddingBlock: 8,
    paddingInline: 10,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: {
      default: colors.chipBorder,
      ":focus-visible": colors.ink,
    },
    borderRadius: 0,
    outline: "none",
    backgroundColor: colors.surface,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: fontSizes.body,
    lineHeight: 1.5,
  },
  message: {
    paddingBlock: 8,
    paddingInline: 12,
    borderLeftWidth: 2,
    borderLeftStyle: "solid",
    fontFamily: fonts.mono,
    fontSize: fontSizes.label,
    lineHeight: 1.5,
  },
  error: {
    borderLeftColor: "oklch(0.55 0.2 27)",
    backgroundColor: "oklch(0.96 0.03 27)",
    color: "oklch(0.4 0.15 27)",
  },
  info: {
    borderLeftColor: colors.ink,
    backgroundColor: colors.hoverTint,
    color: colors.body,
  },
});

type Variant = "primary" | "secondary" | "danger";

export function Button({
  variant = "secondary",
  ...props
}: { variant?: Variant } & Omit<
  ComponentProps<"button">,
  "className" | "style"
>) {
  return (
    <button
      type="button"
      {...props}
      {...stylex.props(styles.button, styles[variant])}
    />
  );
}

/** A link that looks like a {@link Button}. */
export function ButtonLink({
  variant = "secondary",
  href,
  children,
}: {
  variant?: Variant;
  href: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} {...stylex.props(styles.button, styles[variant])}>
      {children}
    </Link>
  );
}

/** A labelled control, with an optional hint underneath. */
export function Field({
  label,
  hint,
  children,
  style,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
  style?: StyleXStyles<{
    alignSelf?: "stretch";
    flexGrow?: number;
    gridColumn?: string;
  }>;
}) {
  return (
    <label {...stylex.props(styles.field, style)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      {children}
      {hint && <span {...stylex.props(styles.hint)}>{hint}</span>}
    </label>
  );
}

export function Input(
  props: Omit<ComponentProps<"input">, "className" | "style">,
) {
  return <input {...props} {...stylex.props(styles.input)} />;
}

export function TextArea({
  style,
  ...props
}: Omit<ComponentProps<"textarea">, "className" | "style"> & {
  style?: StyleXStyles<{
    minHeight?: string;
    fontFamily?: string;
    fontSize?: string;
  }>;
}) {
  return <textarea {...props} {...stylex.props(styles.input, style)} />;
}

/** A line of feedback from a form: what went wrong, or what happened. */
export function Message({
  tone = "info",
  children,
}: {
  tone?: "info" | "error";
  children: ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      {...stylex.props(styles.message, styles[tone])}
    >
      {children}
    </p>
  );
}
