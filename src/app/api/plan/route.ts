import { z } from "zod";
import { AirDataError } from "@/lib/air/open-meteo";
import { generatePlan } from "@/lib/ai/gemini";
import { profileSchema } from "@/lib/domain/profile";
import { getAirReport, normaliseCity } from "@/lib/server/air-service";
import { clientKey, jsonError, readJson } from "@/lib/server/http";
import { createPlanService } from "@/lib/server/plan-service";
import { createRateLimiter } from "@/lib/server/rate-limit";

const bodySchema = z.object({ profile: profileSchema }).strict();
const limiter = createRateLimiter(10, 60_000);
const planFor = createPlanService({ getAirReport, generatePlan });

export async function POST(request: Request): Promise<Response> {
  const wait = limiter.check(clientKey(request));
  if (wait > 0) return jsonError(429, "Too many requests. Try again shortly.", { "Retry-After": String(wait) });

  const body = await readJson(request, bodySchema);
  if (!body.ok) return body.response;

  try {
    const { profile } = body.data;
    const result = await planFor(profile, normaliseCity(profile.city));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AirDataError) {
      return jsonError(error.kind === "not_found" ? 404 : 502, error.message);
    }
    console.error("Plan request failed", error);
    return jsonError(500, "Something went wrong building your plan.");
  }
}
