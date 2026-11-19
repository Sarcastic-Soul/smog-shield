import { POLLUTANT_LABELS, type AirReport } from "../air/types";
import type { Insights } from "./insights";
import { PLAN_LIMITS, type Plan } from "./plan";
import type { Profile } from "./profile-options";
import { buildCommunityActions } from "./rules/community";
import { buildGroupAdvice } from "./rules/groups";
import { buildIndoorHacks } from "./rules/indoor";
import { buildRoutine, scheduleFromNow } from "./rules/routine";
import { buildAlternatives } from "./rules/swaps";

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
