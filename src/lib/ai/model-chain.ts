/**
 * Tries a list of Gemini models in order. A later model is only used when an
 * earlier one is overloaded (503), rate limited (429) or too slow, which
 * happens at peak hours. Pure and dependency-free, so it is easy to test.
 */

export interface ModelChainOptions {
  /** Limit per model attempt, so one slow model cannot eat the whole budget. */
  attemptTimeoutMs: number;
  /** Pause before trying the next model. */
  retryDelayMs: number;
}

/** The HTTP status carried by an SDK error, if any. */
export function statusOf(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

/** Overload, quota and per-attempt timeouts are worth trying the next model. */
export function isRetryable(error: unknown): boolean {
  const status = statusOf(error);
  if (status === 503 || status === 429) return true;
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|aborted|timed? ?out/i.test(String(error));
}

/** Puts `preferred` first without repeating it. */
export function orderModels(defaults: readonly string[], preferred?: string): string[] {
  return preferred ? [preferred, ...defaults.filter((model) => model !== preferred)] : [...defaults];
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `call` on each model in turn until one succeeds, a hard error occurs or `budget` aborts. */
export async function withModelChain<T>(
  models: readonly string[],
  budget: AbortSignal,
  call: (model: string, attemptSignal: AbortSignal) => Promise<T>,
  { attemptTimeoutMs, retryDelayMs }: ModelChainOptions,
): Promise<T> {
  let lastError: unknown = new Error("No model available");
  for (const [index, model] of models.entries()) {
    if (budget.aborted) break;
    if (index > 0) await pause(retryDelayMs);
    try {
      return await call(model, AbortSignal.any([budget, AbortSignal.timeout(attemptTimeoutMs)]));
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) break;
      console.warn(`Gemini ${model} unavailable (${statusOf(error) ?? "timeout"})`);
    }
  }
  throw lastError;
}
