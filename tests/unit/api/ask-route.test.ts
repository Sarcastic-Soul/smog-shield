import { beforeEach, describe, expect, it, vi } from "vitest";
import { AirDataError } from "@/lib/air/open-meteo";
import { delhiReport } from "../../fixtures/delhi";
import { freshIp, jsonRequest, validProfile } from "./helpers";

vi.mock("@/lib/server/air-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/air-service")>("@/lib/server/air-service");
  return { ...actual, getAirReport: vi.fn() };
});
vi.mock("@/lib/ai/gemini", () => ({
  generatePlan: vi.fn(),
  isAiConfigured: vi.fn(),
  streamAnswer: vi.fn(),
}));

const { POST } = await import("@/app/api/ask/route");
const { getAirReport } = await import("@/lib/server/air-service");
const { isAiConfigured, streamAnswer } = await import("@/lib/ai/gemini");
const mockedAir = vi.mocked(getAirReport);
const mockedConfigured = vi.mocked(isAiConfigured);
const mockedStream = vi.mocked(streamAnswer);

const call = (body: unknown, ip?: string) => POST(jsonRequest("http://test.local/api/ask", body, ip));
const goodBody = () => ({ profile: validProfile(), question: "Can the kids play outside?" });

async function* chunks(...parts: string[]) {
  for (const part of parts) yield part;
}

beforeEach(() => {
  mockedAir.mockReset();
  mockedAir.mockResolvedValue(delhiReport());
  mockedConfigured.mockReset();
  mockedConfigured.mockReturnValue(true);
  mockedStream.mockReset();
  mockedStream.mockImplementation(() => chunks("Keep them ", "inside."));
});

describe("POST /api/ask", () => {
  it("returns 503 when the AI is not configured", async () => {
    mockedConfigured.mockReturnValue(false);
    const response = await call(goodBody());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/offline/);
    expect(mockedStream).not.toHaveBeenCalled();
  });

  it("streams the answer as plain text", async () => {
    const response = await call(goodBody());
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("Keep them inside.");
  });

  it("builds the prompt on the server from facts and the question", async () => {
    await (await call(goodBody())).text();
    const prompt = mockedStream.mock.calls[0][0];
    expect(prompt).toContain("FACTS:");
    expect(prompt).toContain("US AQI 118");
    expect(prompt).toContain("<question>Can the kids play outside?</question>");
  });

  it("appends an apology when the stream fails midway", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    mockedStream.mockImplementation(async function* () {
      yield "Partial ";
      throw new Error("cut");
    });
    const text = await (await call(goodBody())).text();
    expect(text).toContain("Partial");
    expect(text).toContain("Sorry, the answer was cut off");
  });

  it("returns 422 for a too-short question", async () => {
    const response = await call({ ...goodBody(), question: "hi" });
    expect(response.status).toBe(422);
  });

  it("returns 422 for a question over 300 characters", async () => {
    expect((await call({ ...goodBody(), question: "x".repeat(301) })).status).toBe(422);
  });

  it("returns 422 for an invalid profile", async () => {
    const profile = { ...validProfile(), city: "<b>" };
    expect((await call({ ...goodBody(), profile })).status).toBe(422);
  });

  it("returns 404 when the city is not found", async () => {
    mockedAir.mockRejectedValue(new AirDataError("nope", "not_found"));
    expect((await call(goodBody())).status).toBe(404);
  });

  it("returns 502 when the air service fails", async () => {
    mockedAir.mockRejectedValue(new AirDataError("down", "upstream"));
    expect((await call(goodBody())).status).toBe(502);
  });

  it("returns 429 after 20 questions from one address", async () => {
    const ip = freshIp();
    for (let i = 0; i < 20; i++) expect((await call(goodBody(), ip)).status).toBe(200);
    const blocked = await call(goodBody(), ip);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).not.toBeNull();
  });
});
