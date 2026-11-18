import { bandFor, cigarettesPerDay, timesWhoLimit } from "../air/aqi";
import type { AirReport } from "../air/types";
import {
  commuteSwaps,
  COOKING_PM25_ADDED,
  exerciseShift,
  HEATING_HAZARD,
  indoorEstimate,
  maskEffect,
  weeklyCommuteKm,
  CO2_KG_PER_KM,
  type CommuteSwap,
  type ExerciseShift,
  type IndoorEstimate,
  type MaskEffect,
} from "./impact";
import type { Profile } from "./profile";
import { assessRisk, type HouseholdRisk } from "./risk";
import { findWindows, type AirWindow } from "./windows";

/**
 * Every number the assistant shows comes from here. The language model only
 * explains these facts; it never invents its own figures.
 */
export interface Insights {
  band: { id: string; label: string };
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
  cooking: { fuel: Profile["home"]["cooking"]; addedPm25: number; isPolluting: boolean };
  heatingHazard: (typeof HEATING_HAZARD)[keyof typeof HEATING_HAZARD];
  safetyAlerts: string[];
}

export function buildInsights(profile: Profile, report: AirReport): Insights {
  const { now } = report;
  const band = bandFor(now.aqi);
  const risk = assessRisk(now.aqi, profile);
  const windows = findWindows(report.next24h);
  const minutes = profile.home.outdoorExerciseMinutes;
  const weeklyKm = weeklyCommuteKm(profile);
  const addedPm25 = COOKING_PM25_ADDED[profile.home.cooking];
  const heatingHazard = HEATING_HAZARD[profile.home.heating];

  const safetyAlerts: string[] = [];
  if (heatingHazard === "carbon_monoxide") {
    safetyAlerts.push(
      "Burning coal or wood in a closed room can cause carbon monoxide poisoning. Never sleep with an angithi lit; keep a window open a crack.",
    );
  }
  if (heatingHazard === "nitrogen_dioxide") {
    safetyAlerts.push(
      "Unflued gas heaters release nitrogen dioxide and carbon monoxide indoors. Run them only with ventilation and never overnight.",
    );
  }
  if (risk.level === "severe" && risk.hasSensitiveMembers) {
    safetyAlerts.push(
      "Watch for breathlessness, chest tightness or wheezing. Keep inhalers and medicines in reach and call a doctor if symptoms get worse.",
    );
  }

  return {
    band: { id: band.id, label: band.label },
    risk,
    cigarettesPerDay: cigarettesPerDay(now.pm25),
    timesWhoLimit: timesWhoLimit(now.pm25),
    windows,
    exercise:
      windows && minutes > 0 ? exerciseShift(minutes, windows.worst.avgPm25, windows.best.avgPm25) : null,
    indoor: indoorEstimate(now.pm25),
    mask: maskEffect(now.pm25),
    commute: {
      weeklyKm,
      weeklyCo2Kg: Math.round(CO2_KG_PER_KM[profile.commute.mode] * weeklyKm * 10) / 10,
      swaps: commuteSwaps(profile),
    },
    cooking: { fuel: profile.home.cooking, addedPm25, isPolluting: addedPm25 >= 100 },
    heatingHazard,
    safetyAlerts,
  };
}
