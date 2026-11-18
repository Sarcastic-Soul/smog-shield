import { roundTo } from "../math";
import type { CommuteMode, CookingFuel, HeatingType, Profile } from "./profile-options";

/**
 * Rough, published-range emission factors. They are estimates meant to show
 * the size of a choice, not to audit anyone. Sources are listed in README.md.
 */

/** kg CO2 per passenger-km (India GHG Program / ICCT ranges). */
export const CO2_KG_PER_KM: Record<CommuteMode, number> = {
  car_petrol: 0.14,
  car_diesel: 0.15,
  car_cng: 0.11,
  two_wheeler: 0.04,
  auto_rickshaw: 0.06,
  bus: 0.015,
  metro: 0.02,
  bicycle: 0,
  walk: 0,
  work_from_home: 0,
};

/** Tailpipe PM2.5, grams per passenger-km (older-fleet averages). */
export const PM25_G_PER_KM: Record<CommuteMode, number> = {
  car_petrol: 0.004,
  car_diesel: 0.025,
  car_cng: 0.002,
  two_wheeler: 0.015,
  auto_rickshaw: 0.01,
  bus: 0.002,
  metro: 0,
  bicycle: 0,
  walk: 0,
  work_from_home: 0,
};

/**
 * Share of outdoor PM2.5 that ends up inside a closed home in winter.
 * Studies in Delhi homes report 0.5 to 0.9; we use a middle value.
 */
export const INDOOR_INFILTRATION = 0.7;

/** A right-sized HEPA purifier removes roughly 60% of the PM2.5 left indoors. */
export const PURIFIER_REDUCTION = 0.6;

/** A well-fitted N95 cuts inhaled PM2.5 by around 80% in real use. */
export const N95_REAL_WORLD_REDUCTION = 0.8;

/** Breathing rate in m³/hour (US EPA Exposure Factors Handbook). */
export const BREATHING_M3_PER_HOUR = { resting: 0.5, exercise: 1.6 } as const;

/** Extra PM2.5 in the kitchen while cooking, µg/m³ (WHO household air ranges). */
export const COOKING_PM25_ADDED: Record<CookingFuel, number> = {
  biomass: 500,
  kerosene: 150,
  lpg: 25,
  piped_gas: 25,
  induction: 5,
};

export type HeatingHazard = "none" | "carbon_monoxide" | "nitrogen_dioxide";

export const HEATING_HAZARD: Record<HeatingType, HeatingHazard> = {
  none: "none",
  electric_heater: "none",
  heat_pump: "none",
  gas_heater: "nitrogen_dioxide",
  coal_or_wood: "carbon_monoxide",
};

/** Weeks a year someone actually commutes (holidays and leave removed). */
export const WORKING_WEEKS_PER_YEAR = 46;

/** Light walking roughly doubles the resting breathing rate. */
export const WALKING_BREATHING_FACTOR = 2;

/** Extra indoor PM2.5 in homes where someone smokes inside, µg/m³ (WHO/US EPA ranges). */
export const SMOKER_INDOOR_PM25 = 40;

/** Cooking that adds this much PM2.5 or more is flagged as polluting. */
export const POLLUTING_COOKING_PM25 = 100;

export function weeklyCommuteKm(profile: Profile): number {
  const { mode, distanceKm, daysPerWeek } = profile.commute;
  return mode === "work_from_home" ? 0 : distanceKm * 2 * daysPerWeek;
}

export interface CommuteSwap {
  to: CommuteMode;
  co2KgSavedPerWeek: number;
  pm25GramsSavedPerWeek: number;
  /** Yearly CO2 saved, kg, over WORKING_WEEKS_PER_YEAR. */
  co2KgSavedPerYear: number;
}

/** Commute modes that make sense as a swap, given trip length. */
function realisticAlternatives(distanceKm: number): CommuteMode[] {
  const options: CommuteMode[] = ["metro", "bus", "car_cng", "work_from_home"];
  if (distanceKm <= 8) options.unshift("bicycle");
  if (distanceKm <= 2.5) options.unshift("walk");
  return options;
}

export function commuteSwaps(profile: Profile): CommuteSwap[] {
  const km = weeklyCommuteKm(profile);
  const from = profile.commute.mode;
  if (km === 0) return [];

  return (
    realisticAlternatives(profile.commute.distanceKm)
      .filter((to) => to !== from && CO2_KG_PER_KM[to] < CO2_KG_PER_KM[from])
      .map((to) => {
        const co2 = (CO2_KG_PER_KM[from] - CO2_KG_PER_KM[to]) * km;
        return {
          to,
          co2KgSavedPerWeek: roundTo(co2),
          pm25GramsSavedPerWeek: roundTo(Math.max(0, PM25_G_PER_KM[from] - PM25_G_PER_KM[to]) * km, 2),
          co2KgSavedPerYear: Math.round(co2 * WORKING_WEEKS_PER_YEAR),
        };
      })
      // Shared transport first (something to do every day), remote work last.
      .sort(
        (a, b) =>
          Number(a.to === "work_from_home") - Number(b.to === "work_from_home") ||
          b.co2KgSavedPerWeek - a.co2KgSavedPerWeek,
      )
  );
}

export interface IndoorEstimate {
  outdoorPm25: number;
  indoorPm25: number;
  indoorWithPurifier: number;
  /** Percent drop in indoor PM2.5 if a purifier runs. */
  purifierCutPercent: number;
}

/** Indoor PM2.5 with windows shut, plus any smoking indoors. */
export function indoorEstimate(outdoorPm25: number, smokerAtHome = false): IndoorEstimate {
  const indoor = outdoorPm25 * INDOOR_INFILTRATION + (smokerAtHome ? SMOKER_INDOOR_PM25 : 0);
  const withPurifier = indoor * (1 - PURIFIER_REDUCTION);
  return {
    outdoorPm25: roundTo(outdoorPm25),
    indoorPm25: roundTo(indoor),
    indoorWithPurifier: roundTo(withPurifier),
    purifierCutPercent: Math.round(PURIFIER_REDUCTION * 100),
  };
}

export interface ExerciseShift {
  minutes: number;
  /** µg of PM2.5 breathed in during the worst window. */
  doseAtWorst: number;
  doseAtBest: number;
  /** Percent less PM2.5 breathed by moving to the best window. */
  cutPercent: number;
  /** Extra cut when also moving the session indoors with a purifier. */
  indoorDose: number;
}

/** Inhaled dose = concentration × breathing rate × time. */
export function exerciseShift(minutes: number, worstPm25: number, bestPm25: number): ExerciseShift {
  const hours = minutes / 60;
  const rate = BREATHING_M3_PER_HOUR.exercise;
  const doseAtWorst = worstPm25 * rate * hours;
  const doseAtBest = bestPm25 * rate * hours;
  const indoorDose = bestPm25 * INDOOR_INFILTRATION * (1 - PURIFIER_REDUCTION) * rate * hours;
  return {
    minutes,
    doseAtWorst: Math.round(doseAtWorst),
    doseAtBest: Math.round(doseAtBest),
    cutPercent: doseAtWorst > 0 ? Math.round((1 - doseAtBest / doseAtWorst) * 100) : 0,
    indoorDose: Math.round(indoorDose),
  };
}

export interface MaskEffect {
  /** µg breathed in during a one-hour walk without a mask. */
  doseNoMask: number;
  doseWithN95: number;
}

export function maskEffect(pm25: number): MaskEffect {
  const dose = pm25 * BREATHING_M3_PER_HOUR.resting * WALKING_BREATHING_FACTOR;
  return { doseNoMask: Math.round(dose), doseWithN95: Math.round(dose * (1 - N95_REAL_WORLD_REDUCTION)) };
}

/** Typical sizes used to show what a change means beyond one home. */
export const COMMUNITY_SCALES = [
  { id: "home", label: "Just our home", households: 1 },
  { id: "building", label: "Our building or lane (40 homes)", households: 40 },
  { id: "ward", label: "Our ward (1,000 homes)", households: 1000 },
] as const;

/** The scale used for community numbers in the plan. */
export const BUILDING_SCALE = COMMUNITY_SCALES[1];

/** A mature tree takes up roughly 21 kg of CO2 a year (European Environment Agency). */
export const TREE_KG_CO2_PER_YEAR = 21;

/** How many trees' yearly uptake a CO2 saving equals (at least 1 for any saving). */
export function treesEquivalent(co2KgPerYear: number): number {
  return co2KgPerYear > 0 ? Math.max(1, Math.round(co2KgPerYear / TREE_KG_CO2_PER_YEAR)) : 0;
}

/** Percent cut from `before` to `after`, never negative. */
export function cutPercent(before: number, after: number): number {
  return before > 0 ? Math.max(0, Math.round((1 - after / before) * 100)) : 0;
}

/**
 * PM2.5 breathed during exercise for the simulator: at the worst hour, moved to
 * the cleanest window, or moved indoors with a filter.
 */
export function simulatedExerciseDose(exercise: ExerciseShift, choice: "worst" | "best" | "indoors"): number {
  if (choice === "indoors") return exercise.indoorDose;
  return choice === "best" ? exercise.doseAtBest : exercise.doseAtWorst;
}

export interface CommunityImpact {
  households: number;
  co2TonnesPerYear: number;
  pm25KgPerYear: number;
}

/** Scales one household's swap to many households making the same change. */
export function communityImpact(swap: CommuteSwap, households: number): CommunityImpact {
  return {
    households,
    co2TonnesPerYear: roundTo((swap.co2KgSavedPerYear * households) / 1000),
    pm25KgPerYear: roundTo((swap.pm25GramsSavedPerWeek * WORKING_WEEKS_PER_YEAR * households) / 1000, 2),
  };
}
