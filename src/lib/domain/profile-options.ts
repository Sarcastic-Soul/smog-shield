/*
 * Profile options, labels and defaults with no zod dependency, so client
 * components can import them without pulling the validation library into the
 * main bundle. The schema itself lives in profile.ts.
 */
import type { Profile } from "./profile";

export type { Profile };

/** Ways a household member gets to work or school. */
export const COMMUTE_MODES = [
  "car_petrol",
  "car_diesel",
  "car_cng",
  "two_wheeler",
  "auto_rickshaw",
  "bus",
  "metro",
  "bicycle",
  "walk",
  "work_from_home",
] as const;

export const COOKING_FUELS = ["lpg", "piped_gas", "induction", "kerosene", "biomass"] as const;

export const HEATING_TYPES = ["none", "electric_heater", "heat_pump", "gas_heater", "coal_or_wood"] as const;

export const HEALTH_CONDITIONS = ["asthma", "copd", "heart_disease", "pregnancy", "allergies"] as const;

/** Field limits shared by the schema and the form. */
export const PROFILE_LIMITS = { cityMin: 2, cityMax: 80, notesMax: 280 } as const;

/** Length limits for a follow-up question, shared by the route and the ask box. */
export const QUESTION_LIMITS = { min: 3, max: 300 } as const;

export const BUDGETS = ["low", "medium", "high"] as const;

/** Languages the plan and answers can be written in. */
export const LANGUAGES = ["en", "hi", "ur", "bn", "pa"] as const;

export type CommuteMode = (typeof COMMUTE_MODES)[number];
export type CookingFuel = (typeof COOKING_FUELS)[number];
export type HeatingType = (typeof HEATING_TYPES)[number];
export type HealthCondition = (typeof HEALTH_CONDITIONS)[number];
export type Budget = (typeof BUDGETS)[number];
export type Language = (typeof LANGUAGES)[number];

export const DEFAULT_PROFILE: Profile = {
  city: "New Delhi",
  household: { adults: 2, children: 1, seniors: 1, conditions: ["asthma"] },
  commute: { mode: "car_petrol", distanceKm: 12, daysPerWeek: 5 },
  home: {
    cooking: "lpg",
    heating: "electric_heater",
    hasPurifier: false,
    smokerAtHome: false,
    wasteBurningNearby: false,
    outdoorExerciseMinutes: 45,
  },
  budget: "medium",
  language: "en",
  notes: "",
};

export const COMMUTE_LABELS: Record<CommuteMode, string> = {
  car_petrol: "Petrol car",
  car_diesel: "Diesel car",
  car_cng: "CNG car",
  two_wheeler: "Scooter / motorbike",
  auto_rickshaw: "Auto-rickshaw",
  bus: "Bus",
  metro: "Metro / train",
  bicycle: "Bicycle",
  walk: "Walk",
  work_from_home: "Work from home",
};

export const COOKING_LABELS: Record<CookingFuel, string> = {
  lpg: "LPG cylinder",
  piped_gas: "Piped natural gas",
  induction: "Induction / electric",
  kerosene: "Kerosene stove",
  biomass: "Wood, coal or dung (chulha)",
};

export const HEATING_LABELS: Record<HeatingType, string> = {
  none: "No heating",
  electric_heater: "Electric heater",
  heat_pump: "Heat pump / inverter AC",
  gas_heater: "Gas heater (no flue)",
  coal_or_wood: "Coal or wood fire (angithi, brazier)",
};

export const CONDITION_LABELS: Record<HealthCondition, string> = {
  asthma: "Asthma",
  copd: "COPD",
  heart_disease: "Heart disease",
  pregnancy: "Pregnancy",
  allergies: "Allergies",
};

/** Display name in the language itself, plus the English name for the prompt. */
export const LANGUAGE_LABELS: Record<Language, { native: string; english: string }> = {
  en: { native: "English", english: "English" },
  hi: { native: "हिन्दी", english: "Hindi" },
  ur: { native: "اردو", english: "Urdu" },
  bn: { native: "বাংলা", english: "Bengali" },
  pa: { native: "ਪੰਜਾਬੀ", english: "Punjabi" },
};

/** Right-to-left scripts need `dir="rtl"` on the generated text. */
export const RTL_LANGUAGES: ReadonlySet<Language> = new Set(["ur"]);
