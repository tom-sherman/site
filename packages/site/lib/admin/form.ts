/** A form field's text, trimmed; `""` when it's missing or a file. */
export function text(form: FormData, name: string): string {
  return untrimmed(form, name).trim();
}

/** A form field's text as it was typed; `""` when it's missing or a file. */
export function untrimmed(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}

/** Comma-separated tags, without `#`s or repeats. */
export function tags(form: FormData, name = "tags"): string[] {
  return [
    ...new Set(
      text(form, name)
        .split(",")
        .map((tag) => tag.trim().replace(/^#/, ""))
        .filter(Boolean),
    ),
  ];
}
