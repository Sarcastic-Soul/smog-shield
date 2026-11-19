import "server-only";
import { GoogleGenAI } from "@google/genai";
import { planJsonSchema, planSchema, type Plan } from "@/lib/domain/plan";
import { ASK_BUDGET_MS, ATTEMPT_TIMEOUT_MS, PLAN_BUDGET_MS, RETRY_DELAY_MS } from "@/lib/ai/budgets";
import { createCircuitBreaker, type CircuitBreaker } from "@/lib/ai/circuit-breaker";
import { ASK_SYSTEM_INSTRUCTION, PLAN_SYSTEM_INSTRUCTION } from "@/lib/ai/instructions";
import { orderModels, withModelChain, type ModelChainOptions } from "@/lib/ai/model-chain";
import { logWarn } from "@/lib/log";

/** Default model first, then backups for when it is overloaded. */
export const DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3-flash-preview"] as const;

const CHAIN_OPTIONS: ModelChainOptions = { attemptTimeoutMs: ATTEMPT_TIMEOUT_MS, retryDelayMs: RETRY_DELAY_MS };

/** Generation settings: steady JSON for plans, a little more natural wording for answers. */
const PLAN_GENERATION = { temperature: 0.4, maxOutputTokens: 4096 } as const;
const ANSWER_GENERATION = { temperature: 0.5, maxOutputTokens: 600 } as const;

/** After 3 failures in a row, skip Gemini for a minute. */
const BREAKER_SETTINGS = { threshold: 3, cooldownMs: 60_000 } as const;

/** The slice of the `@google/genai` client we use, so tests can pass a fake. */
export type GenAiModels = Pick<GoogleGenAI["models"], "generateContent" | "generateContentStream">;

export interface Assistant {
  /** False while the circuit breaker is open after repeated failures. */
  isAvailable(): boolean;
  /** A schema-checked plan, or null on any failure so the caller can use rules. */
  generatePlan(prompt: string): Promise<Plan | null>;
  /** A short answer as plain text chunks. */
  streamAnswer(prompt: string, clientSignal?: AbortSignal): AsyncGenerator<string>;
}

export interface AssistantDeps {
  models: GenAiModels;
  modelNames: readonly string[];
  breaker: CircuitBreaker;
  chainOptions?: ModelChainOptions;
}

/** Builds the Gemini-backed assistant. Every dependency is passed in. */
export function createAssistant({
  models,
  modelNames,
  breaker,
  chainOptions = CHAIN_OPTIONS,
}: AssistantDeps): Assistant {
  async function generatePlan(prompt: string): Promise<Plan | null> {
    if (breaker.isOpen()) return null;
    try {
      const response = await withModelChain(
        modelNames,
        AbortSignal.timeout(PLAN_BUDGET_MS),
        (model, signal) =>
          models.generateContent({
            model,
            contents: prompt,
            config: {
              systemInstruction: PLAN_SYSTEM_INSTRUCTION,
              responseMimeType: "application/json",
              responseJsonSchema: planJsonSchema,
              ...PLAN_GENERATION,
              abortSignal: signal,
            },
          }),
        chainOptions,
      );
      const parsed = planSchema.safeParse(JSON.parse(response.text ?? ""));
      breaker.record(parsed.success);
      if (!parsed.success) logWarn("Gemini plan failed validation", parsed.error);
      return parsed.success ? parsed.data : null;
    } catch (error) {
      logWarn("Gemini plan request failed", error);
      breaker.record(false);
      return null;
    }
  }

  async function* streamAnswer(prompt: string, clientSignal?: AbortSignal): AsyncGenerator<string> {
    const budget = AbortSignal.timeout(ASK_BUDGET_MS);
    const signal = clientSignal ? AbortSignal.any([clientSignal, budget]) : budget;
    let stream: AsyncGenerator<{ text?: string }>;
    try {
      // Only the start of the stream is retried; the per-attempt timeout is not
      // passed down, so a long answer is not cut off once text flows.
      stream = await withModelChain(
        modelNames,
        signal,
        (model) =>
          models.generateContentStream({
            model,
            contents: prompt,
            config: {
              systemInstruction: ASK_SYSTEM_INSTRUCTION,
              ...ANSWER_GENERATION,
              abortSignal: signal,
            },
          }),
        chainOptions,
      );
      breaker.record(true);
    } catch (error) {
      breaker.record(false);
      throw error;
    }
    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text;
    }
  }

  return { isAvailable: () => !breaker.isOpen(), generatePlan, streamAnswer };
}

/**
 * The assistant configured from the environment, or null when no key is set
 * (the app then runs on rules alone). `v1beta` serves both the stable and the
 * preview models in the chain.
 */
export function assistantFromEnv(env: NodeJS.ProcessEnv = process.env): Assistant | null {
  if (!env.GEMINI_API_KEY) return null;
  const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY, apiVersion: "v1beta" });
  return createAssistant({
    models: client.models,
    modelNames: orderModels(DEFAULT_MODELS, env.GEMINI_MODEL),
    // Shared by plans and answers.
    breaker: createCircuitBreaker(BREAKER_SETTINGS),
  });
}
