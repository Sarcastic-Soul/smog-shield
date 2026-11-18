import { buildFallbackPlan } from "@/lib/domain/fallback-plan";
import { buildInsights } from "@/lib/domain/insights";
import { makeProfile } from "./profiles";
import { delhiReport } from "./delhi";
import type { PlanResult } from "@/lib/server/plan-service";

/** A full /api/plan response for the default Delhi household. */
export function planResultFixture(): PlanResult {
  const profile = makeProfile();
  const report = delhiReport();
  const insights = buildInsights(profile, report);
  return { report, insights, plan: buildFallbackPlan(profile, report, insights), source: "rules" };
}
