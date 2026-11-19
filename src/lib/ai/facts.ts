import { clockOf, dateOf, POLLUTANT_LABELS, type AirReport } from "../air/types";
import { BUILDING_SCALE } from "../domain/emissions";
import type { Insights } from "../domain/insights";
import { PLAN_LIMITS } from "../domain/plan";
import {
  COMMUTE_LABELS,
  CONDITION_LABELS,
  COOKING_LABELS,
  HEATING_LABELS,
  LANGUAGE_ENGLISH_NAMES,
  type Language,
  type Profile,
} from "../domain/profile-options";
import { dayOf, type AirWindow } from "../domain/windows";

/**
 * The FACTS block: every number Gemini may quote, written as short labelled
 * lines. Built on the server from the rule engine, so a client can never feed
 * the model its own figures. Shared by the plan and the follow-up answers.
 */

const yesNo = (value: boolean) => (value ? "yes" : "no");

export function languageName(language: Language): string {
  return LANGUAGE_ENGLISH_NAMES[language];
}

function describeWindow(window: AirWindow, nowTime: string): string {
  return `${dayOf(window.start, nowTime)} ${clockOf(window.start)}-${clockOf(window.end)} (PM2.5 ${window.avgPm25}, hourly AQI ${window.avgAqi})`;
}

function airLines(report: AirReport, insights: Insights): string[] {
  const { now, place } = report;
  const w = insights.windows;
  return [
    `Location: ${place.name}${place.region ? `, ${place.region}` : ""}, ${place.country}. Local date ${dateOf(now.time)}, local time now ${clockOf(now.time)}.`,
    `Now: US AQI ${now.aqi} (${insights.band.label}), main pollutant ${POLLUTANT_LABELS[now.dominant]}; PM2.5 ${now.pm25} µg/m³ = ${insights.timesWhoLimit}x WHO daily limit = about ${insights.cigarettesPerDay} cigarettes/day; PM10 ${now.pm10}; NO2 ${now.no2}; ozone ${now.ozone}.`,
    w
      ? `Cleanest daytime window: ${describeWindow(w.best, now.time)}. Worst: ${describeWindow(w.worst, now.time)}.`
      : "No daytime forecast window available.",
    insights.outlook.days.length
      ? `Next days (daily mean PM2.5): ${insights.outlook.days.map((d) => `${d.date} ${d.avgPm25}`).join("; ")}. Trend: ${insights.outlook.trend}.`
      : "No multi-day outlook.",
  ];
}

function householdLines(profile: Profile, insights: Insights): string[] {
  const { adults, children, seniors, conditions } = profile.household;
  const health = conditions.length ? conditions.map((c) => CONDITION_LABELS[c]).join(", ") : "none listed";
  return [
    `Household risk: ${insights.risk.level}. Rule: ${insights.risk.outdoorRule} N95 advised: ${yesNo(insights.risk.maskAdvised)}.`,
    `Sensitive groups: ${insights.risk.sensitiveGroups.map((g) => g.label).join("; ") || "none"}.`,
    `Household: ${adults} adult(s), ${children} child(ren), ${seniors} senior(s); health conditions: ${health}. Budget: ${profile.budget}.`,
  ];
}

function exposureLines(profile: Profile, insights: Insights): string[] {
  const { exercise, indoor, mask } = insights;
  return [
    exercise
      ? `Moving ${exercise.minutes} min of exercise from the worst to the cleanest window: inhaled PM2.5 ${exercise.doseAtWorst} µg -> ${exercise.doseAtBest} µg (${exercise.cutPercent}% less); indoors with purifier ${exercise.indoorDose} µg.`
      : "No regular outdoor exercise.",
    `Indoor estimate: ~${indoor.indoorPm25} µg/m³ with windows shut; ~${indoor.indoorWithPurifier} µg/m³ with a HEPA purifier (${indoor.purifierCutPercent}% less). Has purifier: ${yesNo(profile.home.hasPurifier)}. Smoker at home: ${yesNo(profile.home.smokerAtHome)}.`,
    `N95 on a 1-hour walk: ${mask.doseNoMask} µg -> ${mask.doseWithN95} µg PM2.5 inhaled.`,
    `Outdoor exercise habit: ${profile.home.outdoorExerciseMinutes} min/day.`,
  ];
}

function emissionLines(profile: Profile, insights: Insights): string[] {
  const { commute, community } = insights;
  const swaps = commute.swaps.slice(0, PLAN_LIMITS.commuteSwapsShown);
  const swapList = swaps
    .map(
      (s, i) =>
        `Swap ${i + 1}: ${COMMUTE_LABELS[s.to]} saves ${s.co2KgSavedPerWeek} kg CO2/week (${s.co2KgSavedPerYear} kg/year) and ${s.pm25GramsSavedPerWeek} g tailpipe PM2.5/week`,
    )
    .join("; ");
  return [
    `Commute: ${COMMUTE_LABELS[profile.commute.mode]}, ${profile.commute.distanceKm} km each way, ${profile.commute.daysPerWeek} days/week = ${commute.weeklyKm} km/week, ${commute.weeklyCo2Kg} kg CO2/week.`,
    swaps.length ? `Commute swaps: ${swapList}.` : "Commute swaps: none, already low emission.",
    community && swaps[0]
      ? `Community: if ${BUILDING_SCALE.households} homes in the building made the ${COMMUTE_LABELS[swaps[0].to]} swap, ${community.co2TonnesPerYear} t CO2/year and ${community.pm25KgPerYear} kg tailpipe PM2.5/year saved.`
      : "Community: commute already low emission; focus on burning, shared clean rooms and school rules.",
  ];
}

function homeLines(profile: Profile, insights: Insights): string[] {
  return [
    `Waste or crop burning nearby: ${yesNo(profile.home.wasteBurningNearby)}.`,
    `Cooking: ${COOKING_LABELS[profile.home.cooking]}, adds ~${insights.cooking.addedPm25} µg/m³ PM2.5 in the kitchen while cooking.`,
    `Heating: ${HEATING_LABELS[profile.home.heating]}. Hazard: ${insights.heatingHazard}.`,
  ];
}

/** Facts block shared by the plan and the follow-up questions. */
export function buildFacts(profile: Profile, report: AirReport, insights: Insights): string {
  const lines = [
    `Language: ${languageName(profile.language)}.`,
    ...airLines(report, insights),
    ...householdLines(profile, insights),
    ...exposureLines(profile, insights),
    ...emissionLines(profile, insights),
    ...homeLines(profile, insights),
  ];
  if (insights.safetyAlerts.length) lines.push(`Safety alerts: ${insights.safetyAlerts.join(" ")}`);
  return lines.join("\n");
}
