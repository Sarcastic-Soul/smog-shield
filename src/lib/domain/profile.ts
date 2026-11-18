import { z } from "zod";

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

export const BUDGETS = ["low", "medium", "high"] as const;

export type CommuteMode = (typeof COMMUTE_MODES)[number];
export type CookingFuel = (typeof COOKING_FUELS)[number];
export type HeatingType = (typeof HEATING_TYPES)[number];
export type HealthCondition = (typeof HEALTH_CONDITIONS)[number];
export type Budget = (typeof BUDGETS)[number];

const count = (max: number) => z.number().int().min(0).max(max);

/**
 * Household profile sent by the browser. Every field is bounded so a hostile
 * client cannot push huge values into the prompt or the maths.
 */
export const profileSchema = z
  .object({
    city: z
      .string()
      .trim()
      .min(2, "Enter a city name")
      .max(80)
      // Letters (any script), spaces and a few separators only.
      .regex(/^[\p{L}\p{M} .,'-]+$/u, "Use letters only"),
    household: z.object({
      adults: count(12).min(1),
      children: count(12),
      seniors: count(12),
      conditions: z.array(z.enum(HEALTH_CONDITIONS)).max(HEALTH_CONDITIONS.length),
    }),
    commute: z.object({
      mode: z.enum(COMMUTE_MODES),
      distanceKm: z.number().min(0).max(150),
      daysPerWeek: count(7),
    }),
    home: z.object({
      cooking: z.enum(COOKING_FUELS),
      heating: z.enum(HEATING_TYPES),
      hasPurifier: z.boolean(),
      outdoorExerciseMinutes: z.number().int().min(0).max(240),
    }),
    budget: z.enum(BUDGETS),
    notes: z.string().trim().max(280).optional().default(""),
  })
  .strict();

export type Profile = z.infer<typeof profileSchema>;
export type ProfileInput = z.input<typeof profileSchema>;

export const DEFAULT_PROFILE: Profile = {
  city: "New Delhi",
  household: { adults: 2, children: 1, seniors: 1, conditions: ["asthma"] },
  commute: { mode: "car_petrol", distanceKm: 12, daysPerWeek: 5 },
  home: { cooking: "lpg", heating: "electric_heater", hasPurifier: false, outdoorExerciseMinutes: 45 },
  budget: "medium",
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
  coal_or_wood: "Coal or wood fire (angithi)",
};

export const CONDITION_LABELS: Record<HealthCondition, string> = {
  asthma: "Asthma",
  copd: "COPD",
  heart_disease: "Heart disease",
  pregnancy: "Pregnancy",
  allergies: "Allergies",
};
