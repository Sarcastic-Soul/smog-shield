import type { AirReport } from "../air/types";
import { buildFacts, buildPlanPrompt } from "../ai/prompt";
import { buildFallbackPlan } from "../domain/fallback-plan";
import { buildInsights, type Insights } from "../domain/insights";
import type { Plan, PlanSource } from "../domain/plan";
import type { Profile } from "../domain/profile";
import { LruCache } from "./lru";

export interface PlanResult {
  report: AirReport;
  insights: Insights;
  plan: Plan;
  source: PlanSource;
}

export interface PlanDeps {
  getAirReport: (city: string) => Promise<AirReport>;
  generatePlan: (prompt: string) => Promise<Plan | null>;
}

/**
 * Builds the full answer for one household. Dependencies are injected so the
 * flow can be tested without network calls.
 */
export function createPlanService(deps: PlanDeps, cacheSize = 200) {
  // Same household + same forecast hour = same plan. Saves AI calls.
  const cache = new LruCache<{ plan: Plan; source: PlanSource }>(cacheSize);

  return async function planFor(profile: Profile, cityKey: string): Promise<PlanResult> {
    const report = await deps.getAirReport(cityKey);
    const insights = buildInsights(profile, report);
    const key = `${report.now.time}|${JSON.stringify(profile)}`;

    const cached = cache.get(key);
    if (cached) return { report, insights, ...cached };

    const facts = buildFacts(profile, report, insights);
    const aiPlan = await deps.generatePlan(buildPlanPrompt(facts, profile.notes));
    const entry = aiPlan
      ? { plan: aiPlan, source: "gemini" as const }
      : { plan: buildFallbackPlan(profile, report, insights), source: "rules" as const };

    // Only cache AI answers; a fallback should retry Gemini next time.
    if (entry.source === "gemini") cache.set(key, entry);
    return { report, insights, ...entry };
  };
}
