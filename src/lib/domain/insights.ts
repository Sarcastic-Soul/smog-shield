import { bandFor, cigarettesPerDay, timesWhoLimit, type AqiBandId } from "../air/aqi";
import type { AirReport, DailyOutlook } from "../air/types";
import { roundTo } from "../math";
import {
  CO2_KG_PER_KM,
  BUILDING_SCALE,
  communityImpact,
  commuteSwaps,
  COOKING_PM25_ADDED,
  exerciseShift,
  HEATING_HAZARD,
  indoorEstimate,
  maskEffect,
  POLLUTING_COOKING_PM25,
  SMOKER_INDOOR_PM25,
  weeklyCommuteKm,
  type CommunityImpact,
  type CommuteSwap,
  type ExerciseShift,
  type HeatingHazard,
  type IndoorEstimate,
  type MaskEffect,
} from "./impact";
import type { CookingFuel, Profile } from "./profile-options";
import { assessRisk, type HouseholdRisk } from "./risk";
import { findWindows, type AirWindow } from "./windows";

export type Trend = "worsening" | "steady" | "improving";

/**
 * Every number the assistant shows comes from here. The language model only
 * explains these facts; it never invents its own figures.
 */
export interface Insights {
  band: { id: AqiBandId; label: string; colorVar: string };
  risk: HouseholdRisk;
  cigarettesPerDay: number;
  timesWhoLimit: number;
  windows: { best: AirWindow; worst: AirWindow } | null;
  exercise: ExerciseShift | null;
  indoor: IndoorEstimate;
  mask: MaskEffect;
  commute: {
    weeklyKm: number;
    weeklyCo2Kg: number;
    swaps: CommuteSwap[];
  };
  /** The best commute swap scaled to a building of households, if any. */
  community: CommunityImpact | null;
  cooking: { fuel: CookingFuel; addedPm25: number; isPolluting: boolean };
  heatingHazard: HeatingHazard;
  outlook: { days: DailyOutlook[]; trend: Trend };
  safetyAlerts: string[];
}

/** A change of more than 15% in daily PM2.5 counts as a trend. */
const TREND_THRESHOLD = 0.15;

function trendOf(todayPm25: number, days: DailyOutlook[]): Trend {
  if (days.length === 0 || todayPm25 <= 0) return "steady";
  const change = (days[days.length - 1].avgPm25 - todayPm25) / todayPm25;
  if (change > TREND_THRESHOLD) return "worsening";
  if (change < -TREND_THRESHOLD) return "improving";
  return "steady";
}

function safetyAlertsFor(profile: Profile, risk: HouseholdRisk, heatingHazard: HeatingHazard): string[] {
  const alerts: string[] = [];
  if (heatingHazard === "carbon_monoxide") {
    alerts.push(
      "Burning coal or wood indoors (an angithi, brazier or open fire) can cause carbon monoxide poisoning. Never sleep with it lit. While it burns, keep one window open a crack even on smoggy days: carbon monoxide is more dangerous than the smog.",
    );
  }
  if (heatingHazard === "nitrogen_dioxide") {
    alerts.push(
      "Unflued gas heaters release nitrogen dioxide and carbon monoxide indoors. Run them only with ventilation and never overnight.",
    );
  }
  if (profile.home.smokerAtHome && risk.hasSensitiveMembers) {
    alerts.push(
      `Smoking indoors adds about ${SMOKER_INDOOR_PM25} µg/m³ of PM2.5 for everyone at home. Smoke outside, away from windows.`,
    );
  }
  if (risk.level === "severe" && risk.hasSensitiveMembers) {
    alerts.push(
      "Watch for breathlessness, chest tightness or wheezing. Keep inhalers and medicines in reach and call a doctor if symptoms get worse.",
    );
  }
  return alerts;
}

export function buildInsights(profile: Profile, report: AirReport): Insights {
  const { now } = report;
  const band = bandFor(now.aqi);
  const risk = assessRisk(now.aqi, profile);
  const windows = findWindows(report.next24h);
  const minutes = profile.home.outdoorExerciseMinutes;
  const weeklyKm = weeklyCommuteKm(profile);
  const swaps = commuteSwaps(profile);
  const addedPm25 = COOKING_PM25_ADDED[profile.home.cooking];
  const heatingHazard = HEATING_HAZARD[profile.home.heating];

  return {
    band: { id: band.id, label: band.label, colorVar: band.colorVar },
    risk,
    cigarettesPerDay: cigarettesPerDay(now.pm25),
    timesWhoLimit: timesWhoLimit(now.pm25),
    windows,
    exercise: windows && minutes > 0 ? exerciseShift(minutes, windows.worst.avgPm25, windows.best.avgPm25) : null,
    indoor: indoorEstimate(now.pm25, profile.home.smokerAtHome),
    mask: maskEffect(now.pm25),
    commute: {
      weeklyKm,
      weeklyCo2Kg: roundTo(CO2_KG_PER_KM[profile.commute.mode] * weeklyKm),
      swaps,
    },
    community: swaps[0] ? communityImpact(swaps[0], BUILDING_SCALE.households) : null,
    cooking: { fuel: profile.home.cooking, addedPm25, isPolluting: addedPm25 >= POLLUTING_COOKING_PM25 },
    heatingHazard,
    outlook: { days: report.outlook, trend: trendOf(now.pm25, report.outlook) },
    safetyAlerts: safetyAlertsFor(profile, risk, heatingHazard),
  };
}
