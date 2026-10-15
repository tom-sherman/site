import "server-only";
import { XrpcError } from "@atproto/lex";

/** What to show on a form when a write fails. The details are logged. */
export function failureMessage(error: unknown): string {
  console.error("CMS write failed", error);
  if (error instanceof XrpcError) {
    return `My PDS said no: ${error.message} (${error.error})`;
  }
  return error instanceof Error
    ? `Something went wrong: ${error.message}`
    : "Something went wrong.";
}
