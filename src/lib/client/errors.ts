/** True when a fetch was cancelled on purpose (new request or unmount). */
export function isAbortError(error: unknown): boolean {
  // DOMException extends Error in browsers and Node 17+.
  return error instanceof Error && error.name === "AbortError";
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
