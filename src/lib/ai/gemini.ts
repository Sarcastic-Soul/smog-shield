import "server-only";
import { GoogleGenAI } from "@google/genai";
import { planJsonSchema, planSchema, type Plan } from "../domain/plan";
import { ASK_SYSTEM_INSTRUCTION, PLAN_SYSTEM_INSTRUCTION } from "./prompt";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
/** Tried once if the main model is overloaded (503) or rate limited (429). */
const BACKUP_MODEL = "gemini-3.1-flash-lite";
const PLAN_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 400;

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
  const primary = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  return primary === BACKUP_MODEL ? [primary] : [primary, BACKUP_MODEL];
}

/** Overload and quota errors are worth one retry on another model. */
function isRetryable(error: unknown): boolean {
  const status = (error as { status?: number })?.status;
  return (
    status === 503 ||
    status === 429 ||
    /UNAVAILABLE|RESOURCE_EXHAUSTED/.test(String(error))
  );
}

async function withBackup<T>(run: (model: string) => Promise<T>): Promise<T> {
  const [primary, ...rest] = models();
  try {
    return await run(primary);
  } catch (error) {
    if (!rest.length || !isRetryable(error)) throw error;
    console.warn(`Gemini ${primary} unavailable, retrying with ${rest[0]}`);
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return run(rest[0]);
  }
}

/**
 * Asks Gemini for a structured plan. Returns null on any failure (no key,
 * timeout, bad JSON, schema mismatch) so the caller can fall back to rules.
 */
export async function generatePlan(prompt: string): Promise<Plan | null> {
  const ai = getClient();
  if (!ai) return null;

  const signal = AbortSignal.timeout(PLAN_TIMEOUT_MS);
  try {
    const response = await withBackup((model) =>
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
      console.warn(
        "Gemini plan failed validation",
        parsed.error.issues.slice(0, 3),
      );
      return null;
    }
    return parsed.data;
  } catch (error) {
    console.warn(
      "Gemini plan request failed",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/** Streams a short answer as plain text chunks. */
export async function* streamAnswer(
  prompt: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const ai = getClient();
  if (!ai) throw new Error("AI is not configured");

  const stream = await withBackup((model) =>
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
  for await (const chunk of stream) {
    if (chunk.text) yield chunk.text;
  }
}
