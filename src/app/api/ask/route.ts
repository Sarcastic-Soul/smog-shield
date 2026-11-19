import { z } from "zod";
import { buildAskPrompt } from "@/lib/ai/prompt";
import { profileSchema } from "@/lib/domain/profile";
import { QUESTION_LIMITS } from "@/lib/domain/profile-options";
import { errorResponse, guardRequest, jsonError, streamText } from "@/lib/server/http";
import { askLimiter, assistant, planService } from "@/lib/server/services";
import { logWarn } from "@/lib/log";

/** Seconds; must stay above ASK_BUDGET_MS (src/lib/ai/budgets.ts). Next.js needs a literal here. */
export const maxDuration = 30;
/** Run near the main users (South Asia) to cut round trips. */
export const preferredRegion = "bom1";

const bodySchema = z
  .object({
    profile: profileSchema,
    question: z.string().trim().min(QUESTION_LIMITS.min, "Ask a longer question").max(QUESTION_LIMITS.max),
  })
  .strict();

/** Streams a short Gemini answer as plain text, grounded in facts rebuilt on the server. */
export async function POST(request: Request): Promise<Response> {
  if (!assistant?.isAvailable()) {
    return jsonError(503, "The assistant is busy right now. Your plan still works; try again in a minute.");
  }
  const body = await guardRequest(request, askLimiter, bodySchema);
  if (!body.ok) return body.response;
  const { profile, question } = body.data;

  let prompt: string;
  try {
    // Facts are rebuilt here, so the client cannot feed fake numbers to the model.
    prompt = buildAskPrompt((await planService.factsFor(profile)).text, question);
  } catch (error) {
    return errorResponse(error, "Something went wrong answering your question.");
  }

  return streamText(assistant.streamAnswer(prompt, request.signal), "text/plain; charset=utf-8", (error) => {
    logWarn("Ask stream failed", error);
    return "\n\nSorry, the answer was cut off. Please try again.";
  });
}
