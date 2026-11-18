/** True when a fetch was cancelled on purpose (new request or unmount). */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException ? error.name === "AbortError" : (error as Error | null)?.name === "AbortError";
}

export function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
