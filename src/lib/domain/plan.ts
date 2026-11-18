import { z } from "zod";

/**
 * Shape of the daily plan. Gemini is asked to return exactly this as JSON, and
 * the rule-based fallback produces the same shape, so the UI has one contract.
 */
const text = (max: number) => z.string().trim().min(1).max(max);

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
        activity: text(140),
        why: text(240).describe("The reason, tied to the forecast or a household member"),
      }),
    )
    .min(3)
    .max(8)
    .describe("Today's low-exposure, low-emission routine in time order"),
  indoorHacks: z
    .array(z.object({ title: text(80), action: text(240), impact: text(200) }))
    .min(2)
    .max(6)
    .describe("Practical indoor air steps; impact must quote the given numbers"),
  alternatives: z
    .array(z.object({ swap: text(100), action: text(240), impact: text(200) }))
    .min(1)
    .max(5)
    .describe("Sustainable swaps that cut emissions; impact must quote the given numbers"),
  groupAdvice: z
    .array(z.object({ group: text(60), advice: text(240) }))
    .max(6)
    .describe("Advice for each sensitive group in the home"),
});

export type Plan = z.infer<typeof planSchema>;

export type PlanSource = "gemini" | "rules";

/** JSON schema handed to Gemini's structured output. */
export const planJsonSchema = z.toJSONSchema(planSchema, { target: "draft-7" });
