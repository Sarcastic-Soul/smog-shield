import { z } from "zod";
import { profileSchema } from "@/lib/domain/profile";
import { clientKey, errorResponse, isCrossSite, jsonError, readJson } from "@/lib/server/http";
import { planLimiter, planService } from "@/lib/server/services";

/** Gemini can take a while at peak times; the plan has its own 26 s budget. */
export const maxDuration = 40;
/** Run near the main users (South Asia) to cut round trips to the browser. */
export const preferredRegion = "bom1";

const bodySchema = z.object({ profile: profileSchema }).strict();

/**
 * Streams the plan as NDJSON: a rule-based draft first (instant), then the
 * final plan from Gemini. Air-data errors are reported before streaming starts,
 * so they keep proper status codes.
 */
export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return jsonError(403, "Cross-site requests are not allowed");

  const wait = planLimiter.check(clientKey(request));
  if (wait > 0) return jsonError(429, "Too many requests. Try again shortly.", { "Retry-After": String(wait) });

  const body = await readJson(request, bodySchema);
  if (!body.ok) return body.response;

  const { profile } = body.data;
  let facts;
  try {
    facts = await planService.factsFor(profile);
  } catch (error) {
    return errorResponse(error, "Something went wrong building your plan.");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of planService.planEvents(profile, facts)) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (error) {
        console.error("Plan stream failed", error);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}
