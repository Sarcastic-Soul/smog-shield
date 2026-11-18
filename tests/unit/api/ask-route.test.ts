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
  isAiAvailable: vi.fn(),
  streamAnswer: vi.fn(),
}));

const { POST } = await import("@/app/api/ask/route");
const { getAirReport } = await import("@/lib/server/air-service");
const { isAiAvailable, isAiConfigured, streamAnswer } = await import("@/lib/ai/gemini");
const mockedAir = vi.mocked(getAirReport);
const mockedConfigured = vi.mocked(isAiConfigured);
const mockedAvailable = vi.mocked(isAiAvailable);
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
  mockedAvailable.mockReset();
  mockedAvailable.mockReturnValue(true);
  mockedStream.mockReset();
  mockedStream.mockImplementation(() => chunks("Keep them ", "inside."));
});

describe("POST /api/ask", () => {
  it("returns 503 when the AI is not configured", async () => {
    mockedConfigured.mockReturnValue(false);
    const response = await call(goodBody());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/busy right now/);
    expect(mockedStream).not.toHaveBeenCalled();
  });

  it("returns 503 when the circuit breaker is open, before touching air data or the limiter", async () => {
    mockedAvailable.mockReturnValue(false);
    const response = await call(goodBody());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toMatch(/busy right now/);
    expect(mockedStream).not.toHaveBeenCalled();
    expect(mockedAir).not.toHaveBeenCalled();
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

  it("returns 403 for a cross-site request without reaching the AI", async () => {
    const request = new Request("http://test.local/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: JSON.stringify(goodBody()),
    });
    expect((await POST(request)).status).toBe(403);
    expect(mockedStream).not.toHaveBeenCalled();
  });

  it("returns 413 when content-length says the body is too big", async () => {
    const request = new Request("http://test.local/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "50000" },
      body: "{}",
    });
    expect((await POST(request)).status).toBe(413);
  });

  it("rate limits before reading the body, so bad bodies use up slots", async () => {
    const ip = freshIp();
    for (let i = 0; i < 20; i++) expect((await call({ ...goodBody(), question: "hi" }, ip)).status).toBe(422);
    expect((await call(goodBody(), ip)).status).toBe(429);
  });

  it("uses the shared question limits", async () => {
    const { QUESTION_LIMITS } = await import("@/lib/domain/profile");
    const min = "x".repeat(QUESTION_LIMITS.min);
    const max = "x".repeat(QUESTION_LIMITS.max);
    expect((await call({ ...goodBody(), question: min })).status).toBe(200);
    expect((await call({ ...goodBody(), question: max })).status).toBe(200);
    expect((await call({ ...goodBody(), question: max + "x" })).status).toBe(422);
    expect((await call({ ...goodBody(), question: min.slice(1) })).status).toBe(422);
  });

  it("rebuilds the facts from the profile city, not from anything the client sends", async () => {
    await (await call(goodBody())).text();
    expect(mockedAir).toHaveBeenCalledWith("New Delhi");
  });

  it("returns 500 with a generic message for unexpected errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedAir.mockRejectedValue(new Error("kaboom"));
    const response = await call(goodBody());
    expect(response.status).toBe(500);
    expect((await response.json()).error).not.toContain("kaboom");
  });

  it("exports a max duration for the route", async () => {
    const route = await import("@/app/api/ask/route");
    expect(route.maxDuration).toBeGreaterThanOrEqual(25);
  });
});
