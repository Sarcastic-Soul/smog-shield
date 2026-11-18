import { z } from "zod";
import { AirDataError } from "@/lib/air/open-meteo";
import { isAiConfigured, streamAnswer } from "@/lib/ai/gemini";
import { buildAskPrompt, buildFacts } from "@/lib/ai/prompt";
import { buildInsights } from "@/lib/domain/insights";
import { profileSchema } from "@/lib/domain/profile";
import { getAirReport, normaliseCity } from "@/lib/server/air-service";
import { clientKey, jsonError, readJson } from "@/lib/server/http";
import { createRateLimiter } from "@/lib/server/rate-limit";

const bodySchema = z
  .object({
    profile: profileSchema,
    question: z.string().trim().min(3, "Ask a longer question").max(300),
  })
  .strict();

const limiter = createRateLimiter(20, 60_000);

export async function POST(request: Request): Promise<Response> {
  const wait = limiter.check(clientKey(request));
  if (wait > 0) return jsonError(429, "Too many questions. Try again shortly.", { "Retry-After": String(wait) });
  if (!isAiConfigured()) return jsonError(503, "The assistant is offline right now. Your plan still works.");

  const body = await readJson(request, bodySchema);
  if (!body.ok) return body.response;

  const { profile, question } = body.data;
  let prompt: string;
  try {
    // Facts are rebuilt on the server, so the client cannot feed fake numbers.
    const report = await getAirReport(normaliseCity(profile.city));
    prompt = buildAskPrompt(buildFacts(profile, report, buildInsights(profile, report)), question);
  } catch (error) {
    if (error instanceof AirDataError) return jsonError(error.kind === "not_found" ? 404 : 502, error.message);
    throw error;
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
