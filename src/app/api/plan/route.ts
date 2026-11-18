import { z } from "zod";
import { profileSchema } from "@/lib/domain/profile";
import { clientKey, errorResponse, isCrossSite, jsonError, readJson } from "@/lib/server/http";
import { planLimiter, planService } from "@/lib/server/services";

/** Gemini can take a while at peak times; the plan has its own 26 s budget. */
export const maxDuration = 40;

const bodySchema = z.object({ profile: profileSchema }).strict();

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return jsonError(403, "Cross-site requests are not allowed");

  const body = await readJson(request, bodySchema);
  if (!body.ok) return body.response;

  const wait = planLimiter.check(clientKey(request));
  if (wait > 0) return jsonError(429, "Too many requests. Try again shortly.", { "Retry-After": String(wait) });

  try {
    const { profile } = body.data;
    const result = await planService.planFor(profile, profile.city);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Something went wrong building your plan.");
  }
}
