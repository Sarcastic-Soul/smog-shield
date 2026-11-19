import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCircuitBreaker } from "@/lib/ai/circuit-breaker";
import { assistantFromEnv, createAssistant, DEFAULT_MODELS, type GenAiModels } from "@/lib/ai/gemini";
import { planResultFixture } from "../../fixtures/results";

const samplePlan = planResultFixture().plan;
const planJson = JSON.stringify(samplePlan);
const overloaded = Object.assign(new Error("UNAVAILABLE"), { status: 503 });
const badRequest = Object.assign(new Error("bad"), { status: 400 });

const generateContent = vi.fn();
const generateContentStream = vi.fn();
const fakeModels = { generateContent, generateContentStream } as unknown as GenAiModels;

function setup(cooldownMs = 60_000) {
  const breaker = createCircuitBreaker({ threshold: 3, cooldownMs });
  const assistant = createAssistant({
    models: fakeModels,
    modelNames: DEFAULT_MODELS,
    breaker,
    chainOptions: { attemptTimeoutMs: 1000, retryDelayMs: 0 },
  });
  return { assistant, breaker };
}

const streamOf = (...parts: string[]) =>
  (async function* () {
    for (const text of parts) yield { text };
  })();

const modelsCalled = (mock: typeof generateContent) => mock.mock.calls.map((c) => c[0].model);

async function collect(iterable: AsyncIterable<string>) {
  const parts: string[] = [];
  for await (const part of iterable) parts.push(part);
  return parts;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  generateContent.mockReset();
  generateContentStream.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe("createAssistant.generatePlan", () => {
  it("parses a valid structured plan from the primary model", async () => {
    generateContent.mockResolvedValue({ text: planJson });
    await expect(setup().assistant.generatePlan("p")).resolves.toEqual(samplePlan);
    const request = generateContent.mock.calls[0][0];
    expect(request.model).toBe(DEFAULT_MODELS[0]);
    expect(request.contents).toBe("p");
    expect(request.config.responseMimeType).toBe("application/json");
    expect(request.config.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("tries the models in order while they are overloaded", async () => {
    generateContent.mockRejectedValue(overloaded);
    await expect(setup().assistant.generatePlan("p")).resolves.toBeNull();
    expect(modelsCalled(generateContent)).toEqual([...DEFAULT_MODELS]);
  });

  it("stops at the first model that works", async () => {
    generateContent
      .mockRejectedValueOnce(overloaded)
      .mockRejectedValueOnce(Object.assign(new Error("quota"), { status: 429 }))
      .mockResolvedValueOnce({ text: planJson });
    await expect(setup().assistant.generatePlan("p")).resolves.toEqual(samplePlan);
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("does not retry on a non-retryable error", async () => {
    generateContent.mockRejectedValue(badRequest);
    await expect(setup().assistant.generatePlan("p")).resolves.toBeNull();
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("follows the model order it was given", async () => {
    generateContent.mockRejectedValue(overloaded);
    const breaker = createCircuitBreaker({ threshold: 3, cooldownMs: 1000 });
    const assistant = createAssistant({
      models: fakeModels,
      modelNames: ["x", "y"],
      breaker,
      chainOptions: { attemptTimeoutMs: 1000, retryDelayMs: 0 },
    });
    await assistant.generatePlan("p");
    expect(modelsCalled(generateContent)).toEqual(["x", "y"]);
  });

  it("returns null and records a failure when the output fails the schema", async () => {
    generateContent.mockResolvedValue({ text: JSON.stringify({ headline: "x" }) });
    const { assistant, breaker } = setup();
    const record = vi.spyOn(breaker, "record");
    await expect(assistant.generatePlan("p")).resolves.toBeNull();
    expect(record).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("returns null on malformed JSON or empty text", async () => {
    generateContent.mockResolvedValueOnce({ text: "not json" }).mockResolvedValueOnce({});
    const { assistant } = setup();
    await expect(assistant.generatePlan("p")).resolves.toBeNull();
    await expect(assistant.generatePlan("p")).resolves.toBeNull();
  });

  it("records a success for a valid plan", async () => {
    generateContent.mockResolvedValue({ text: planJson });
    const { assistant, breaker } = setup();
    const record = vi.spyOn(breaker, "record");
    await assistant.generatePlan("p");
    expect(record).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("opens the breaker after 3 failed plans and then skips the API", async () => {
    generateContent.mockResolvedValue({ text: "not json" });
    const { assistant } = setup();
    for (let i = 0; i < 3; i++) await expect(assistant.generatePlan("p")).resolves.toBeNull();
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(assistant.isAvailable()).toBe(false);

    generateContent.mockResolvedValue({ text: planJson });
    await expect(assistant.generatePlan("p")).resolves.toBeNull();
    expect(generateContent).toHaveBeenCalledTimes(3);
  });

  it("does not open the breaker after only 2 failures", async () => {
    generateContent.mockResolvedValue({ text: "not json" });
    const { assistant } = setup();
    await assistant.generatePlan("p");
    await assistant.generatePlan("p");
    expect(assistant.isAvailable()).toBe(true);
    generateContent.mockResolvedValue({ text: planJson });
    await expect(assistant.generatePlan("p")).resolves.toEqual(samplePlan);
  });

  it("counts a success as a reset of the failure streak", async () => {
    const { assistant } = setup();
    generateContent.mockResolvedValue({ text: "not json" });
    await assistant.generatePlan("p");
    await assistant.generatePlan("p");
    generateContent.mockResolvedValue({ text: planJson });
    await assistant.generatePlan("p");
    generateContent.mockResolvedValue({ text: "not json" });
    await assistant.generatePlan("p");
    await assistant.generatePlan("p");
    expect(assistant.isAvailable()).toBe(true);
  });

  it("reopens after the cooldown", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const { assistant } = setup();
      generateContent.mockResolvedValue({ text: "not json" });
      for (let i = 0; i < 3; i++) await assistant.generatePlan("p");
      expect(assistant.isAvailable()).toBe(false);
      vi.advanceTimersByTime(61_000);
      expect(assistant.isAvailable()).toBe(true);
      generateContent.mockResolvedValue({ text: planJson });
      await expect(assistant.generatePlan("p")).resolves.toEqual(samplePlan);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps separate breakers for separate assistants", async () => {
    generateContent.mockResolvedValue({ text: "not json" });
    const a = setup().assistant;
    const b = setup().assistant;
    for (let i = 0; i < 3; i++) await a.generatePlan("p");
    expect(a.isAvailable()).toBe(false);
    expect(b.isAvailable()).toBe(true);
  });
});

describe("createAssistant.streamAnswer", () => {
  it("streams answer chunks in order, skipping empty ones", async () => {
    generateContentStream.mockResolvedValue(streamOf("Stay ", "", "inside."));
    expect(await collect(setup().assistant.streamAnswer("q"))).toEqual(["Stay ", "inside."]);
  });

  it("records a success when the stream starts", async () => {
    generateContentStream.mockResolvedValue(streamOf("ok"));
    const { assistant, breaker } = setup();
    const record = vi.spyOn(breaker, "record");
    await collect(assistant.streamAnswer("q"));
    expect(record).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("retries a stream that fails to start on the next model", async () => {
    generateContentStream.mockRejectedValueOnce(overloaded).mockResolvedValueOnce(streamOf("ok"));
    expect(await collect(setup().assistant.streamAnswer("q"))).toEqual(["ok"]);
    expect(modelsCalled(generateContentStream)).toEqual(DEFAULT_MODELS.slice(0, 2));
  });

  it("throws and records a failure when the stream cannot start", async () => {
    generateContentStream.mockRejectedValue(badRequest);
    const { assistant, breaker } = setup();
    const record = vi.spyOn(breaker, "record");
    await expect(assistant.streamAnswer("q").next()).rejects.toThrow("bad");
    expect(generateContentStream).toHaveBeenCalledTimes(1);
    expect(record).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("opens the breaker after 3 failed stream starts", async () => {
    generateContentStream.mockRejectedValue(badRequest);
    const { assistant } = setup();
    for (let i = 0; i < 3; i++) await expect(assistant.streamAnswer("q").next()).rejects.toThrow("bad");
    expect(assistant.isAvailable()).toBe(false);
  });

  it("stops early when the client signal is already aborted", async () => {
    generateContentStream.mockResolvedValue(streamOf());
    const controller = new AbortController();
    controller.abort();
    await expect(setup().assistant.streamAnswer("q", controller.signal).next()).rejects.toThrow();
    expect(generateContentStream).not.toHaveBeenCalled();
  });

  it("passes an abort signal that follows the client signal", async () => {
    generateContentStream.mockResolvedValue(streamOf("ok"));
    const controller = new AbortController();
    await collect(setup().assistant.streamAnswer("q", controller.signal));
    const signal: AbortSignal = generateContentStream.mock.calls[0][0].config.abortSignal;
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });
});

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe("assistantFromEnv", () => {
  it("returns null when no key is set", () => {
    expect(assistantFromEnv(env({}))).toBeNull();
    expect(assistantFromEnv(env({ GEMINI_API_KEY: "" }))).toBeNull();
  });

  it("returns an available assistant when a key is set", () => {
    const assistant = assistantFromEnv(env({ GEMINI_API_KEY: "test-key" }));
    expect(assistant).not.toBeNull();
    expect(assistant?.isAvailable()).toBe(true);
  });
});
