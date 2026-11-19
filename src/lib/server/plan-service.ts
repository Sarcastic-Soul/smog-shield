import type { AirReport } from "../air/types";
import { buildFacts } from "../ai/facts";
import { buildPlanPrompt } from "../ai/prompt";
import { buildFallbackPlan } from "../domain/fallback-plan";
import { reconcilePlan } from "../domain/rules/reconcile";
import { buildInsights, type Insights } from "../domain/insights";
import type { Plan, PlanSource } from "../domain/plan";
import type { Profile } from "../domain/profile-options";
import type { PlanEvent, PlanResult } from "../domain/result";
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

type CachedPlan = { plan: Plan; source: PlanSource };

/** Gemini plans last for the forecast hour; rule plans briefly, so Gemini is retried soon. */
const AI_PLAN_TTL_MS = 60 * 60_000;
const RULES_PLAN_TTL_MS = 60_000;

/**
 * Builds answers for one household. Dependencies are injected so the whole
 * flow can be tested without network calls.
 */
export interface PlanService {
  /** Server-side facts for a household; used by the plan and the follow-up answers. */
  factsFor(profile: Profile): Promise<Facts>;
  /** A rule-based draft (when Gemini must be called) and then the final plan. */
  planEvents(profile: Profile, facts: Facts): AsyncGenerator<PlanEvent>;
}

export function createPlanService(deps: PlanDeps, cacheSize = 200): PlanService {
  // Same household + same forecast hour = same plan. Saves AI calls.
  const aiPlans = createTtlCache<CachedPlan>({ ttlMs: AI_PLAN_TTL_MS, max: cacheSize });
  const rulePlans = createTtlCache<CachedPlan>({ ttlMs: RULES_PLAN_TTL_MS, max: cacheSize });

  async function factsFor(profile: Profile): Promise<Facts> {
    const report = await deps.getAirReport(profile.city);
    const insights = buildInsights(profile, report);
    return { report, insights, text: buildFacts(profile, report, insights) };
  }

  /**
   * The plan as a short sequence of events. When Gemini has to be called, a
   * rule-based draft is sent first so the family sees useful advice at once,
   * then Gemini's plan replaces it. Cached answers arrive as a single event.
   */
  async function* planEvents(profile: Profile, facts: Facts): AsyncGenerator<PlanEvent> {
    const { report, insights, text } = facts;
    const key = `${report.now.time}|${JSON.stringify(profile)}`;
    const result = (entry: CachedPlan): PlanResult => ({ report, insights, ...entry });

    // A rules plan from the last minute means Gemini just failed for this key: skip the wait.
    const cached = aiPlans.peek(key) ?? rulePlans.peek(key);
    if (cached) {
      yield { kind: "final", result: result(await cached) };
      return;
    }

    const rules: CachedPlan = { plan: buildFallbackPlan(profile, report, insights), source: "rules" };
    yield { kind: "draft", result: result(rules) };

    const ai = await aiPlans
      .get(key, async () => {
        const aiPlan = await deps.generatePlan(buildPlanPrompt(text, profile.notes));
        // A rejected promise is evicted, so a failed AI call is not cached as a hit.
        if (!aiPlan) throw new Error("no AI plan");
        const plan =
          profile.language === "en"
            ? reconcilePlan(aiPlan, rules.plan, { profile, swaps: insights.commute.swaps })
            : aiPlan;
        return { plan, source: "gemini" as const };
      })
      .catch(() => null);

    if (!ai) await rulePlans.get(key, async () => rules);
    yield { kind: "final", result: result(ai ?? rules) };
  }

  return { factsFor, planEvents };
}
