import type { AirReport } from "../air/types";
import { buildFacts, buildPlanPrompt } from "../ai/prompt";
import { buildFallbackPlan, reconcilePlan } from "../domain/fallback-plan";
import { buildInsights, type Insights } from "../domain/insights";
import type { Plan, PlanSource } from "../domain/plan";
import type { Profile } from "../domain/profile";
import type { PlanResult } from "../domain/result";
import { createTtlCache } from "./ttl-cache";

export interface PlanDeps {
  getAirReport: (city: string) => Promise<AirReport>;
  generatePlan: (prompt: string) => Promise<Plan | null>;
}

export interface Facts {
  report: AirReport;
  insights: Insights;
  /** Plain-text facts block handed to the model. */
  text: string;
}

/** Gemini plans last for the forecast hour; rule plans briefly, so Gemini is retried soon. */
const AI_PLAN_TTL_MS = 60 * 60_000;
const RULES_PLAN_TTL_MS = 60_000;

/**
 * Builds answers for one household. Dependencies are injected so the whole
 * flow can be tested without network calls.
 */
export function createPlanService(deps: PlanDeps, cacheSize = 200) {
  // Same household + same forecast hour = same plan. Saves AI calls.
  const aiPlans = createTtlCache<{ plan: Plan; source: PlanSource }>({ ttlMs: AI_PLAN_TTL_MS, max: cacheSize });
  const rulePlans = createTtlCache<{ plan: Plan; source: PlanSource }>({ ttlMs: RULES_PLAN_TTL_MS, max: cacheSize });

  /** Server-side facts for a household. Used by both the plan and the follow-up questions. */
  async function factsFor(profile: Profile, city: string): Promise<Facts> {
    const report = await deps.getAirReport(city);
    const insights = buildInsights(profile, report);
    return { report, insights, text: buildFacts(profile, report, insights) };
  }

  async function planFor(profile: Profile, city: string): Promise<PlanResult> {
    const { report, insights, text } = await factsFor(profile, city);
    const key = `${report.now.time}|${JSON.stringify(profile)}`;
    const fallback = () => buildFallbackPlan(profile, report, insights);

    // A rules plan made in the last minute means Gemini just failed for this key: skip the wait.
    const recentRules = rulePlans.peek(key);
    if (recentRules) return { report, insights, ...(await recentRules) };

    let entry = await aiPlans
      .get(key, async () => {
        const aiPlan = await deps.generatePlan(buildPlanPrompt(text, profile.notes));
        // A rejected promise is evicted, so a failed AI call is not cached as a hit.
        if (!aiPlan) throw new Error("no AI plan");
        const plan = profile.language === "en" ? reconcilePlan(aiPlan, fallback()) : aiPlan;
        return { plan, source: "gemini" as const };
      })
      .catch(() => null);

    entry ??= await rulePlans.get(key, async () => ({ plan: fallback(), source: "rules" as const }));
    return { report, insights, ...entry };
  }

  return { planFor, factsFor };
}
