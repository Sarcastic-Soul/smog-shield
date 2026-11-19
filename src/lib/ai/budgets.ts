/**
 * Time budgets for Gemini calls. The routes' `maxDuration` must stay above
 * these (Next.js needs `maxDuration` as a literal, so a unit test checks it).
 */

/** Total time a plan may take before the caller keeps the rule-based plan. */
export const PLAN_BUDGET_MS = 26_000;
/** Total time for a streamed answer, including retries. */
export const ASK_BUDGET_MS = 25_000;
/** Limit per model attempt, so one slow model cannot eat the whole budget. */
export const ATTEMPT_TIMEOUT_MS = 15_000;
/** Pause before trying the next model in the chain. */
export const RETRY_DELAY_MS = 300;
