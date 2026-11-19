import { z } from "zod";
import { profileSchema } from "@/lib/domain/profile";
import type { PlanEvent } from "@/lib/domain/result";
import { errorResponse, guardRequest, streamText } from "@/lib/server/http";
import type { Facts } from "@/lib/server/plan-service";
import { planLimiter, planService } from "@/lib/server/services";
import { logError } from "@/lib/log";

/** Seconds; must stay above PLAN_BUDGET_MS (src/lib/ai/budgets.ts). Next.js needs a literal here. */
export const maxDuration = 40;
/** Run near the main users (South Asia) to cut round trips. */
export const preferredRegion = "bom1";

const bodySchema = z.object({ profile: profileSchema }).strict();

async function* ndjson(events: AsyncIterable<PlanEvent>): AsyncGenerator<string> {
  for await (const event of events) yield `${JSON.stringify(event)}\n`;
}

/**
 * Streams the plan as NDJSON: a rule-based draft first (instant), then the
 * final plan from Gemini. Air-data errors are reported before streaming
 * starts, so they keep proper status codes.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await guardRequest(request, planLimiter, bodySchema);
  if (!body.ok) return body.response;
  const { profile } = body.data;

  let facts: Facts;
  try {
    facts = await planService.factsFor(profile);
  } catch (error) {
    return errorResponse(error, "Something went wrong building your plan.");
  }

  return streamText(ndjson(planService.planEvents(profile, facts)), "application/x-ndjson; charset=utf-8", (error) => {
    logError("Plan stream failed", error);
    return undefined;
  });
}
