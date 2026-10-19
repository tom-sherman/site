/** A form field's text, trimmed; `""` when it's missing or a file. */
export function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}
