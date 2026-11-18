import { z } from "zod";
import { isAiConfigured, streamAnswer } from "@/lib/ai/gemini";
import { buildAskPrompt } from "@/lib/ai/prompt";
import { profileSchema } from "@/lib/domain/profile";
import { clientKey, errorResponse, isCrossSite, jsonError, readJson } from "@/lib/server/http";
import { askLimiter, planService } from "@/lib/server/services";

/** Streams stop after 25 s on the server side (see ASK_BUDGET_MS). */
export const maxDuration = 30;

const bodySchema = z
  .object({
    profile: profileSchema,
    question: z.string().trim().min(3, "Ask a longer question").max(300),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return jsonError(403, "Cross-site requests are not allowed");
  if (!isAiConfigured()) return jsonError(503, "The assistant is offline right now. Your plan still works.");

  const body = await readJson(request, bodySchema);
  if (!body.ok) return body.response;

  const wait = askLimiter.check(clientKey(request));
  if (wait > 0) return jsonError(429, "Too many questions. Try again shortly.", { "Retry-After": String(wait) });

  const { profile, question } = body.data;
  let prompt: string;
  try {
    // Facts are rebuilt on the server, so the client cannot feed fake numbers.
    const facts = await planService.factsFor(profile, profile.city);
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
