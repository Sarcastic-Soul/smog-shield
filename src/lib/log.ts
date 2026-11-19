/**
 * One place for server logs, so every message has the same prefix and errors
 * are reduced to their message (and cause) the same way. Never log user input
 * or secrets here.
 */

const PREFIX = "[smog-shield]";

/** A short, safe description of anything thrown. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` (cause: ${error.cause.message})` : "";
  return `${error.message}${cause}`;
}

/** Something went wrong but the app recovered (retry, fallback). */
export function logWarn(context: string, error?: unknown): void {
  console.warn(PREFIX, context, ...(error === undefined ? [] : [describeError(error)]));
}

/** Something failed and the user saw an error. */
export function logError(context: string, error: unknown): void {
  console.error(PREFIX, context, describeError(error));
}
