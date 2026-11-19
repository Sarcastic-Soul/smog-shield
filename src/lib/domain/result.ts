import type { AirReport } from "../air/types";
import type { Insights } from "./insights";
import type { Plan, PlanSource } from "./plan";

/** What `/api/plan` returns: the readings, the computed facts and the plan. */
export interface PlanResult {
  report: AirReport;
  insights: Insights;
  plan: Plan;
  source: PlanSource;
}

/**
 * One line of the streamed `/api/plan` response (NDJSON). A `draft` is the
 * rule-based plan sent while Gemini works; `final` is the plan to keep.
 */
export interface PlanEvent {
  kind: "draft" | "final";
  result: PlanResult;
}

/** Narrows parsed JSON from the plan stream to a `PlanEvent`. */
export function isPlanEvent(value: unknown): value is PlanEvent {
  if (typeof value !== "object" || value === null || !("kind" in value) || !("result" in value)) return false;
  const { kind, result } = value;
  return (kind === "draft" || kind === "final") && typeof result === "object" && result !== null;
}
