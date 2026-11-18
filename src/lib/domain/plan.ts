import { z } from "zod";

/**
 * Shape of the daily plan. Gemini is asked to return exactly this as JSON, and
 * the rule-based fallback produces the same shape, so the UI has one contract.
 */
const text = (max: number) => z.string().trim().min(1).max(max);

/** List sizes shared by the schema, the rule-based plan and reconciliation. */
export const PLAN_LIMITS = {
  routineMin: 3,
  routineMax: 8,
  indoorHacksMin: 2,
  indoorHacksMax: 6,
  alternativesMax: 5,
  communityActionsMax: 4,
  groupAdviceMax: 6,
} as const;

export const planSchema = z.object({
  headline: text(120).describe("One short sentence summing up today for this family"),
  summary: text(500).describe("Two or three sentences explaining today's air and the main advice"),
  routine: z
    .array(
      z.object({
        time: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
          .describe("24-hour local time, HH:mm"),
        day: z
          .enum(["today", "tomorrow"])
          .describe("today if the time is still ahead of local time now, else tomorrow"),
        activity: text(140),
        why: text(240).describe("The reason, tied to the forecast or a household member"),
      }),
    )
    .min(PLAN_LIMITS.routineMin)
    .max(PLAN_LIMITS.routineMax)
    .describe("Low-exposure, low-emission routine for the next 24 hours, starting from now, in time order"),
  indoorHacks: z
    .array(z.object({ title: text(80), action: text(240), impact: text(200) }))
    .min(PLAN_LIMITS.indoorHacksMin)
    .max(PLAN_LIMITS.indoorHacksMax)
    .describe("Practical indoor air steps; impact must quote the given numbers"),
  alternatives: z
    .array(z.object({ swap: text(100), action: text(240), impact: text(200) }))
    .min(1)
    .max(PLAN_LIMITS.alternativesMax)
    .describe("Sustainable swaps that cut emissions; impact must quote the given numbers"),
  communityActions: z
    .array(z.object({ who: text(60), action: text(240), impact: text(200) }))
    .min(1)
    .max(PLAN_LIMITS.communityActionsMax)
    .describe("Actions with neighbours, the building/RWA, school or workplace; impact must quote the given numbers"),
  groupAdvice: z
    .array(z.object({ group: text(60), advice: text(240) }))
    .max(PLAN_LIMITS.groupAdviceMax)
    .describe("Advice for each sensitive group in the home"),
});

export type Plan = z.infer<typeof planSchema>;

export type PlanSource = "gemini" | "rules";

/** JSON schema handed to Gemini's structured output. */
export const planJsonSchema = z.toJSONSchema(planSchema, { target: "draft-7" });
