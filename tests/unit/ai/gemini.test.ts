import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { planResultFixture } from "../../fixtures/results";

const samplePlan = planResultFixture().plan;

const generateContent = vi.fn();
const generateContentStream = vi.fn();

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent, generateContentStream };
  },
}));

const overloaded = Object.assign(new Error('{"error":{"code":503,"status":"UNAVAILABLE"}}'), { status: 503 });

async function load() {
  vi.resetModules();
  return import("@/lib/ai/gemini");
}

describe("gemini client", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "");
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    generateContent.mockReset();
    generateContentStream.mockReset();
  });

  it("returns null without calling the API when no key is set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const { generatePlan, isAiConfigured } = await load();
    expect(isAiConfigured()).toBe(false);
    await expect(generatePlan("p")).resolves.toBeNull();
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("parses a valid structured plan from the primary model", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify(samplePlan) });
    const { generatePlan } = await load();
    await expect(generatePlan("p")).resolves.toEqual(samplePlan);
    expect(generateContent.mock.calls[0][0].model).toBe("gemini-3.5-flash-lite");
    expect(generateContent.mock.calls[0][0].config.responseMimeType).toBe("application/json");
  });

  it("retries once on the backup model when the primary is overloaded", async () => {
    generateContent.mockRejectedValueOnce(overloaded).mockResolvedValueOnce({ text: JSON.stringify(samplePlan) });
    const { generatePlan } = await load();
    await expect(generatePlan("p")).resolves.toEqual(samplePlan);
    expect(generateContent.mock.calls.map((c) => c[0].model)).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
    ]);
  });

  it("does not retry on a non-retryable error", async () => {
    generateContent.mockRejectedValue(Object.assign(new Error("bad request"), { status: 400 }));
    const { generatePlan } = await load();
    await expect(generatePlan("p")).resolves.toBeNull();
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("returns null when the model output fails the schema", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ headline: "x" }) });
    const { generatePlan } = await load();
    await expect(generatePlan("p")).resolves.toBeNull();
  });

  it("returns null on malformed JSON", async () => {
    generateContent.mockResolvedValue({ text: "not json" });
    const { generatePlan } = await load();
    await expect(generatePlan("p")).resolves.toBeNull();
  });

  it("streams answer chunks in order", async () => {
    generateContentStream.mockResolvedValue(
      (async function* () {
        yield { text: "Stay " };
        yield { text: "" };
        yield { text: "inside." };
      })(),
    );
    const { streamAnswer } = await load();
    const parts: string[] = [];
    for await (const part of streamAnswer("q")) parts.push(part);
    expect(parts.join("")).toBe("Stay inside.");
  });
});
