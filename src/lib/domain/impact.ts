import type { CommuteMode, CookingFuel, HeatingType, Profile } from "./profile";

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

export const HEATING_HAZARD: Record<HeatingType, "none" | "carbon_monoxide" | "nitrogen_dioxide"> = {
  none: "none",
  electric_heater: "none",
  heat_pump: "none",
  gas_heater: "nitrogen_dioxide",
  coal_or_wood: "carbon_monoxide",
};

const round = (n: number, digits = 1) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export function weeklyCommuteKm(profile: Profile): number {
  const { mode, distanceKm, daysPerWeek } = profile.commute;
  return mode === "work_from_home" ? 0 : distanceKm * 2 * daysPerWeek;
}

export interface CommuteSwap {
  to: CommuteMode;
  co2KgSavedPerWeek: number;
  pm25GramsSavedPerWeek: number;
  /** Yearly CO2 saved, kg. 46 working weeks a year. */
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

  return realisticAlternatives(profile.commute.distanceKm)
    .filter((to) => to !== from && CO2_KG_PER_KM[to] < CO2_KG_PER_KM[from])
    .map((to) => {
      const co2 = (CO2_KG_PER_KM[from] - CO2_KG_PER_KM[to]) * km;
      return {
        to,
        co2KgSavedPerWeek: round(co2),
        pm25GramsSavedPerWeek: round(Math.max(0, PM25_G_PER_KM[from] - PM25_G_PER_KM[to]) * km, 2),
        co2KgSavedPerYear: Math.round(co2 * 46),
      };
    })
    .sort((a, b) => b.co2KgSavedPerWeek - a.co2KgSavedPerWeek);
}

export interface IndoorEstimate {
  outdoorPm25: number;
  indoorPm25: number;
  indoorWithPurifier: number;
  /** Percent drop in indoor PM2.5 if a purifier runs. */
  purifierCutPercent: number;
}

export function indoorEstimate(outdoorPm25: number): IndoorEstimate {
  const indoor = outdoorPm25 * INDOOR_INFILTRATION;
  const withPurifier = indoor * (1 - PURIFIER_REDUCTION);
  return {
    outdoorPm25: round(outdoorPm25),
    indoorPm25: round(indoor),
    indoorWithPurifier: round(withPurifier),
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
  const dose = pm25 * BREATHING_M3_PER_HOUR.resting * 2; // light walking ≈ 2× resting
  return { doseNoMask: Math.round(dose), doseWithN95: Math.round(dose * (1 - N95_REAL_WORLD_REDUCTION)) };
}
