/** `value` if it's an http(s) URL. Records are untrusted, so no `javascript:` links. */
export function httpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !URL.canParse(value)) return undefined;
  const { protocol } = new URL(value);
  return protocol === "https:" || protocol === "http:" ? value : undefined;
}

/** A stable placeholder tint for when there's no artwork. */
export function hueOf(key: string): number {
  let hash = 0;
  for (const char of key) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}
