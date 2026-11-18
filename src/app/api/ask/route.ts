import { z } from "zod";
import { isAiAvailable, isAiConfigured, streamAnswer } from "@/lib/ai/gemini";
import { buildAskPrompt } from "@/lib/ai/prompt";
import { profileSchema, QUESTION_LIMITS } from "@/lib/domain/profile";
import { clientKey, errorResponse, isCrossSite, jsonError, readJson } from "@/lib/server/http";
import { askLimiter, planService } from "@/lib/server/services";

/** Streams stop after 25 s on the server side (see ASK_BUDGET_MS). */
export const maxDuration = 30;
/** Run near the main users (South Asia). */
export const preferredRegion = "bom1";

const bodySchema = z
  .object({
    profile: profileSchema,
    question: z.string().trim().min(QUESTION_LIMITS.min, "Ask a longer question").max(QUESTION_LIMITS.max),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return jsonError(403, "Cross-site requests are not allowed");
  if (!isAiConfigured() || !isAiAvailable()) {
    return jsonError(503, "The assistant is busy right now. Your plan still works; try again in a minute.");
  }

  const wait = askLimiter.check(clientKey(request));
  if (wait > 0) return jsonError(429, "Too many questions. Try again shortly.", { "Retry-After": String(wait) });

  const body = await readJson(request, bodySchema);
  if (!body.ok) return body.response;

  const { profile, question } = body.data;
  let prompt: string;
  try {
    // Facts are rebuilt on the server, so the client cannot feed fake numbers.
    const facts = await planService.factsFor(profile);
    prompt = buildAskPrompt(facts.text, question);
  } catch (error) {
    return errorResponse(error, "Something went wrong answering your question.");
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const text of streamAnswer(prompt, request.signal)) {
          controller.enqueue(encoder.encode(text));
        }
      } catch (error) {
        console.warn("Ask stream failed", error instanceof Error ? error.message : error);
        controller.enqueue(encoder.encode("\n\nSorry, the answer was cut off. Please try again."));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
