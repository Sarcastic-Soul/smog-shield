import { POLLUTANT_LABELS, type AirReport } from "@/lib/air/types";
import type { Insights } from "@/lib/domain/insights";
import { PLAN_LIMITS, type Plan } from "@/lib/domain/plan";
import type { Profile } from "@/lib/domain/profile-options";
import { buildCommunityActions } from "@/lib/domain/rules/community";
import { buildGroupAdvice } from "@/lib/domain/rules/groups";
import { buildIndoorHacks } from "@/lib/domain/rules/indoor";
import { buildRoutine, scheduleFromNow } from "@/lib/domain/rules/routine";
import { buildAlternatives } from "@/lib/domain/rules/swaps";

function summaryOf(report: AirReport, insights: Insights): string {
  const { now } = report;
  const smoke = `PM2.5 is ${now.pm25} µg/m³, like smoking ${insights.cigarettesPerDay} cigarettes a day`;
  const cause =
    now.dominant === "pm25"
      ? `AQI is ${now.aqi}, driven by fine particles. ${smoke}.`
      : `AQI is ${now.aqi}, driven mostly by ${POLLUTANT_LABELS[now.dominant]}. ${smoke}.`;
  return `${cause} ${insights.risk.outdoorRule}`;
}

/**
 * Deterministic plan used when Gemini is unavailable, slow, or returns
 * something that fails validation, and as the instant draft while Gemini
 * works. It uses the same facts, so the advice is still specific to the
 * household and the forecast. Each section lives in `./rules`.
 */
export function buildFallbackPlan(profile: Profile, report: AirReport, insights: Insights): Plan {
  return {
    headline: `${insights.band.label} air in ${report.place.name} — ${insights.risk.level} risk for your home`,
    summary: summaryOf(report, insights),
    routine: scheduleFromNow(buildRoutine(profile, report, insights), report.now.time).slice(0, PLAN_LIMITS.routineMax),
    indoorHacks: buildIndoorHacks(profile, report, insights),
    alternatives: buildAlternatives(profile, insights),
    communityActions: buildCommunityActions(profile, insights),
    groupAdvice: buildGroupAdvice(insights.risk),
  };
}
