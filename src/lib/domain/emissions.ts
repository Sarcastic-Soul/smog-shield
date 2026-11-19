import { roundTo } from "../math";
import type { CommuteMode, Profile } from "./profile-options";

/**
 * Commute emissions and what a swap saves, for one home or many. Factors are
 * published averages, used to show the size of a choice; sources in README.md.
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

/** Weeks a year someone actually commutes (holidays and leave removed). */
export const WORKING_WEEKS_PER_YEAR = 46;

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

/** Longest one-way trips we suggest cycling or walking for, km. */
export const CYCLING_MAX_KM = 8;
export const WALKING_MAX_KM = 2.5;

/** Commute modes that make sense as a swap, given trip length. */
function realisticAlternatives(distanceKm: number): CommuteMode[] {
  const options: CommuteMode[] = ["metro", "bus", "car_cng", "work_from_home"];
  if (distanceKm <= CYCLING_MAX_KM) options.unshift("bicycle");
  if (distanceKm <= WALKING_MAX_KM) options.unshift("walk");
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

/** Typical sizes used to show what a change means beyond one home. */
export const COMMUNITY_SCALE_IDS = ["home", "building", "ward"] as const;
export type CommunityScaleId = (typeof COMMUNITY_SCALE_IDS)[number];

export const COMMUNITY_SCALES: Record<CommunityScaleId, { name: string; households: number }> = {
  home: { name: "Just our home", households: 1 },
  building: { name: "Our building or lane", households: 40 },
  ward: { name: "Our ward", households: 1000 },
};

/** "Our ward (1,000 homes)": the scale's name with its size. */
export function communityScaleLabel(id: CommunityScaleId): string {
  const { name, households } = COMMUNITY_SCALES[id];
  return households > 1 ? `${name} (${households.toLocaleString("en-IN")} homes)` : name;
}

/** The scale used for community numbers in the plan. */
export const BUILDING_SCALE = COMMUNITY_SCALES.building;

/** A mature tree takes up roughly 21 kg of CO2 a year (European Environment Agency). */
export const TREE_KG_CO2_PER_YEAR = 21;

/** How many trees' yearly uptake a CO2 saving equals (at least 1 for any saving). */
export function treesEquivalent(co2KgPerYear: number): number {
  return co2KgPerYear > 0 ? Math.max(1, Math.round(co2KgPerYear / TREE_KG_CO2_PER_YEAR)) : 0;
}

export interface CommunityImpact {
  households: number;
  co2TonnesPerYear: number;
  pm25KgPerYear: number;
  /** Trees whose yearly CO2 uptake matches the saving. */
  trees: number;
}

/** Scales one household's swap to many households making the same change. */
export function communityImpact(swap: CommuteSwap, households: number): CommunityImpact {
  return {
    households,
    co2TonnesPerYear: roundTo((swap.co2KgSavedPerYear * households) / 1000),
    pm25KgPerYear: roundTo((swap.pm25GramsSavedPerWeek * WORKING_WEEKS_PER_YEAR * households) / 1000, 2),
    trees: treesEquivalent(swap.co2KgSavedPerYear * households),
  };
}
