import { roundTo } from "@/lib/math";
import type { CookingFuel, HeatingType } from "@/lib/domain/profile-options";

/**
 * Exposure maths: what reaches the lungs indoors, outdoors and while
 * exercising, and how much a purifier, an N95 or a better hour cuts it.
 * Factors are published averages; sources in README.md.
 */

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

/** Light walking roughly doubles the resting breathing rate. */
export const WALKING_BREATHING_FACTOR = 2;

/** Extra indoor PM2.5 in homes where someone smokes inside, µg/m³ (WHO/US EPA ranges). */
export const SMOKER_INDOOR_PM25 = 40;

/** Cooking that adds this much PM2.5 or more is flagged as polluting. */
export const POLLUTING_COOKING_PM25 = 100;

/** Kitchen PM2.5 added by clean fuels (LPG, piped gas, induction) stays below this, µg/m³. */
export const CLEAN_COOKING_PM25 = 30;

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
