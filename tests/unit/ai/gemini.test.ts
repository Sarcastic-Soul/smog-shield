import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generatePlan, geminiBreaker, isAiAvailable, isRetryable, streamAnswer } from "@/lib/ai/gemini";
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

describe("model chain and circuit breaker", () => {
  beforeEach(() => {
    geminiBreaker.reset();
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

  const modelsCalled = (mock: typeof generateContent) => mock.mock.calls.map((c) => c[0].model);

  it("tries the three default models in order while they are overloaded", async () => {
    generateContent.mockRejectedValue(overloaded);
    await expect(generatePlan("p")).resolves.toBeNull();
    expect(modelsCalled(generateContent)).toEqual([
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-3-flash-preview",
    ]);
  });

  it("stops at the first model that works", async () => {
    generateContent
      .mockRejectedValueOnce(overloaded)
      .mockRejectedValueOnce(Object.assign(new Error("quota"), { status: 429 }))
      .mockResolvedValueOnce({ text: JSON.stringify(samplePlan) });
    await expect(generatePlan("p")).resolves.toEqual(samplePlan);
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("puts GEMINI_MODEL first and does not repeat it", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-3-flash-preview");
    generateContent.mockRejectedValue(overloaded);
    await generatePlan("p");
    expect(modelsCalled(generateContent)).toEqual([
      "gemini-3-flash-preview",
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
    ]);
  });

  it("gives every attempt its own abort signal", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify(samplePlan) });
    await generatePlan("p");
    expect(generateContent.mock.calls[0][0].config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("opens the breaker after 3 failed plans and skips the API until reset", async () => {
    generateContent.mockResolvedValue({ text: "not json" });
    for (let i = 0; i < 3; i++) await expect(generatePlan("p")).resolves.toBeNull();
    expect(generateContent).toHaveBeenCalledTimes(3);

    generateContent.mockResolvedValue({ text: JSON.stringify(samplePlan) });
    await expect(generatePlan("p")).resolves.toBeNull();
    expect(generateContent).toHaveBeenCalledTimes(3);

    geminiBreaker.reset();
    await expect(generatePlan("p")).resolves.toEqual(samplePlan);
    expect(generateContent).toHaveBeenCalledTimes(4);
  });

  it("does not open the breaker after only 2 failures", async () => {
    generateContent.mockResolvedValue({ text: "not json" });
    await generatePlan("p");
    await generatePlan("p");
    generateContent.mockResolvedValue({ text: JSON.stringify(samplePlan) });
    await expect(generatePlan("p")).resolves.toEqual(samplePlan);
  });

  it("counts a success as a reset of the failure streak", async () => {
    generateContent.mockResolvedValue({ text: "not json" });
    await generatePlan("p");
    await generatePlan("p");
    generateContent.mockResolvedValue({ text: JSON.stringify(samplePlan) });
    await generatePlan("p");
    generateContent.mockResolvedValue({ text: "not json" });
    await generatePlan("p");
    await generatePlan("p");
    generateContent.mockResolvedValue({ text: JSON.stringify(samplePlan) });
    await expect(generatePlan("p")).resolves.toEqual(samplePlan);
  });

  it("reopens after the cooldown", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      generateContent.mockResolvedValue({ text: "not json" });
      for (let i = 0; i < 3; i++) await generatePlan("p");
      generateContent.mockResolvedValue({ text: JSON.stringify(samplePlan) });
      await expect(generatePlan("p")).resolves.toBeNull();
      vi.advanceTimersByTime(61_000);
      await expect(generatePlan("p")).resolves.toEqual(samplePlan);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports availability from the breaker", async () => {
    expect(isAiAvailable()).toBe(true);
    generateContent.mockResolvedValue({ text: "not json" });
    for (let i = 0; i < 3; i++) await generatePlan("p");
    expect(isAiAvailable()).toBe(false);
    geminiBreaker.reset();
    expect(isAiAvailable()).toBe(true);
  });

  it("counts failed stream starts toward the breaker and a good start as success", async () => {
    generateContentStream.mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    for (let i = 0; i < 3; i++) await expect(streamAnswer("q").next()).rejects.toThrow("bad");
    expect(isAiAvailable()).toBe(false);
    geminiBreaker.reset();

    generateContentStream.mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    await expect(streamAnswer("q").next()).rejects.toThrow();
    await expect(streamAnswer("q").next()).rejects.toThrow();
    generateContentStream.mockResolvedValueOnce(
      (async function* () {
        yield { text: "ok" };
      })(),
    );
    await streamAnswer("q").next();
    generateContentStream.mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    await expect(streamAnswer("q").next()).rejects.toThrow();
    await expect(streamAnswer("q").next()).rejects.toThrow();
    expect(isAiAvailable()).toBe(true);
  });

  it("retries a stream that fails to start on the next model", async () => {
    generateContentStream.mockRejectedValueOnce(overloaded).mockResolvedValueOnce(
      (async function* () {
        yield { text: "ok" };
      })(),
    );
    const parts: string[] = [];
    for await (const part of streamAnswer("q")) parts.push(part);
    expect(parts).toEqual(["ok"]);
    expect(modelsCalled(generateContentStream)).toEqual(["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]);
  });

  it("throws when the stream cannot start on a non-retryable error", async () => {
    generateContentStream.mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    await expect(streamAnswer("q").next()).rejects.toThrow("bad");
    expect(generateContentStream).toHaveBeenCalledTimes(1);
  });

  it("throws when no key is set", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(streamAnswer("q").next()).rejects.toThrow("AI is not configured");
  });

  it("stops early when the client signal is already aborted", async () => {
    generateContentStream.mockResolvedValue((async function* () {})());
    const controller = new AbortController();
    controller.abort();
    await expect(streamAnswer("q", controller.signal).next()).rejects.toThrow();
    expect(generateContentStream).not.toHaveBeenCalled();
  });
});

describe("isRetryable", () => {
  it("retries overload and quota statuses", () => {
    expect(isRetryable({ status: 503 })).toBe(true);
    expect(isRetryable({ status: 429 })).toBe(true);
  });

  it("retries known error text such as timeouts and aborts", () => {
    expect(isRetryable(new Error("UNAVAILABLE"))).toBe(true);
    expect(isRetryable(new Error("RESOURCE_EXHAUSTED"))).toBe(true);
    expect(isRetryable(new Error("This operation was aborted"))).toBe(true);
    expect(isRetryable(new Error("request timed out"))).toBe(true);
    expect(isRetryable(new Error("Timeout"))).toBe(true);
  });

  it("does not retry client errors or empty values", () => {
    expect(isRetryable({ status: 400 })).toBe(false);
    expect(isRetryable(new Error("bad request"))).toBe(false);
    expect(isRetryable(null)).toBe(false);
  });
});
