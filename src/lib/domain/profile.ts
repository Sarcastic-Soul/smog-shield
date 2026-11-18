import { z } from "zod";
import {
  BUDGETS,
  COMMUTE_MODES,
  COOKING_FUELS,
  HEALTH_CONDITIONS,
  HEATING_TYPES,
  LANGUAGES,
  PROFILE_LIMITS,
} from "./profile-options";

export * from "./profile-options";

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
      .min(PROFILE_LIMITS.cityMin, "Enter a city name")
      .max(PROFILE_LIMITS.cityMax)
      // Latin letters (accents allowed), spaces and a few separators. The
      // geocoder only matches Latin-script names.
      .regex(/^[\p{Script=Latin}\p{M} .,'-]+$/u, "Use English letters for the city name"),
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
      smokerAtHome: z.boolean(),
      wasteBurningNearby: z.boolean(),
      outdoorExerciseMinutes: z.number().int().min(0).max(240),
    }),
    budget: z.enum(BUDGETS),
    language: z.enum(LANGUAGES),
    notes: z.string().trim().max(PROFILE_LIMITS.notesMax).optional().default(""),
  })
  .strict();

export type Profile = z.infer<typeof profileSchema>;
