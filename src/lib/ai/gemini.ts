import "server-only";
import { GoogleGenAI } from "@google/genai";
import { planJsonSchema, planSchema, type Plan } from "../domain/plan";
import { createCircuitBreaker } from "./circuit-breaker";
import { ASK_SYSTEM_INSTRUCTION, PLAN_SYSTEM_INSTRUCTION } from "./prompt";

/**
 * Models tried in order. Later entries are only used when an earlier one is
 * overloaded (503) or rate limited (429), which happens at peak hours.
 */
const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3-flash-preview"];

/** Per-attempt limit, so one slow model cannot eat the whole budget. */
const ATTEMPT_TIMEOUT_MS = 15_000;
/** Total time we let the plan request take before falling back to rules. */
const PLAN_BUDGET_MS = 26_000;
const ASK_BUDGET_MS = 25_000;
const RETRY_DELAY_MS = 300;

/** Shared by plans and answers: after 3 failures in a row, skip Gemini for a minute. */
export const geminiBreaker = createCircuitBreaker({ threshold: 3, cooldownMs: 60_000 });

let client: GoogleGenAI | null = null;

/** Lazily built so tests and key-less builds never touch the network. */
function getClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function models(): string[] {
  const primary = process.env.GEMINI_MODEL;
  return primary ? [primary, ...DEFAULT_MODELS.filter((m) => m !== primary)] : DEFAULT_MODELS;
}

/** Overload, quota and per-attempt timeouts are worth trying the next model. */
export function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status === 503 || status === 429) return true;
  const text = String(error);
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|aborted|timed? ?out/i.test(text);
}

/** Runs `call` on each model in turn until one succeeds or the budget runs out. */
async function withFallbackModels<T>(
  budget: AbortSignal,
  call: (model: string, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  let lastError: unknown = new Error("No model available");
  for (const [index, model] of models().entries()) {
    if (budget.aborted) break;
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    try {
      return await call(model, AbortSignal.any([budget, AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)]));
    } catch (error) {
      lastError = error;
      if (!isRetryable(error)) break;
      console.warn(`Gemini ${model} unavailable (${(error as { status?: number })?.status ?? "timeout"})`);
    }
  }
  throw lastError;
}

/** False while the circuit breaker is open after repeated failures. */
export function isAiAvailable(): boolean {
  return !geminiBreaker.isOpen();
}

/**
 * Asks Gemini for a structured plan. Returns null on any failure (no key,
 * overload, timeout, bad JSON, schema mismatch) so the caller can fall back to
 * rules. A simple circuit breaker stops users waiting on a model that keeps
 * failing.
 */
export async function generatePlan(prompt: string): Promise<Plan | null> {
  const ai = getClient();
  if (!ai || geminiBreaker.isOpen()) return null;

  try {
    const response = await withFallbackModels(AbortSignal.timeout(PLAN_BUDGET_MS), (model, signal) =>
      ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: PLAN_SYSTEM_INSTRUCTION,
          responseMimeType: "application/json",
          responseJsonSchema: planJsonSchema,
          temperature: 0.4,
          maxOutputTokens: 4096,
          abortSignal: signal,
        },
      }),
    );
    const parsed = planSchema.safeParse(JSON.parse(response.text ?? ""));
    if (!parsed.success) {
      console.warn("Gemini plan failed validation", parsed.error.issues.slice(0, 3));
      geminiBreaker.record(false);
      return null;
    }
    geminiBreaker.record(true);
    return parsed.data;
  } catch (error) {
    console.warn("Gemini plan request failed", error instanceof Error ? error.message : error);
    geminiBreaker.record(false);
    return null;
  }
}

/** Streams a short answer as plain text chunks. */
export async function* streamAnswer(prompt: string, clientSignal?: AbortSignal): AsyncGenerator<string> {
  const ai = getClient();
  if (!ai) throw new Error("AI is not configured");

  const budget = AbortSignal.timeout(ASK_BUDGET_MS);
  const signal = clientSignal ? AbortSignal.any([clientSignal, budget]) : budget;
  // Only the start of the stream is retried; once text flows we keep that model.
  // The per-attempt timeout is not passed down, so a long answer is not cut off.
  let stream;
  try {
    stream = await withFallbackModels(signal, (model) =>
      ai.models.generateContentStream({
        model,
        contents: prompt,
        config: {
          systemInstruction: ASK_SYSTEM_INSTRUCTION,
          temperature: 0.5,
          maxOutputTokens: 600,
          abortSignal: signal,
        },
      }),
    );
    geminiBreaker.record(true);
  } catch (error) {
    geminiBreaker.record(false);
    throw error;
  }
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}
