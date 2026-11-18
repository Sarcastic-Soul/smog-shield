import { beforeEach, describe, expect, it, vi } from "vitest";
import { AirDataError } from "@/lib/air/open-meteo";
import { delhiReport } from "../../fixtures/delhi";
import { freshIp, jsonRequest, validProfile } from "./helpers";

vi.mock("@/lib/server/air-service", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/air-service")>("@/lib/server/air-service");
  return { ...actual, getAirReport: vi.fn() };
});
vi.mock("@/lib/ai/gemini", () => ({
  generatePlan: vi.fn(async () => null),
  isAiConfigured: vi.fn(() => false),
  streamAnswer: vi.fn(),
}));

const { POST } = await import("@/app/api/plan/route");
const { getAirReport } = await import("@/lib/server/air-service");
const mockedAir = vi.mocked(getAirReport);

const call = (body: unknown, ip?: string) => POST(jsonRequest("http://test.local/api/plan", body, ip));

beforeEach(() => {
  mockedAir.mockReset();
  mockedAir.mockResolvedValue(delhiReport());
});

describe("POST /api/plan", () => {
  it("returns 200 with report, insights, plan and source", async () => {
    const response = await call({ profile: validProfile() });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const body = await response.json();
    expect(body.report.place.name).toBe("New Delhi");
    expect(body.insights.band.id).toBe("sensitive");
    expect(body.plan.routine.length).toBeGreaterThanOrEqual(3);
    expect(body.source).toBe("rules");
  });

  it("looks the city up with a normalised key", async () => {
    await call({ profile: { ...validProfile(), city: "  New   DELHI " } });
    expect(mockedAir).toHaveBeenCalledWith("new delhi");
  });

  it("returns 422 for an invalid profile", async () => {
    const response = await call({ profile: { ...validProfile(), city: "<script>" } });
    expect(response.status).toBe(422);
    expect((await response.json()).error).toMatch(/city/);
  });

  it("returns 422 for unknown body keys", async () => {
    const response = await call({ profile: validProfile(), extra: true });
    expect(response.status).toBe(422);
  });

  it("returns 415 and 400 for a bad content type and bad JSON", async () => {
    const noType = new Request("http://test.local/api/plan", { method: "POST", body: "{}" });
    expect((await POST(noType)).status).toBe(415);
    expect((await call("{nope")).status).toBe(400);
  });

  it("returns 404 when the city is not found", async () => {
    mockedAir.mockRejectedValue(new AirDataError('We could not find "Atlantis"', "not_found"));
    const response = await call({ profile: { ...validProfile(), city: "Atlantis" } });
    expect(response.status).toBe(404);
    expect((await response.json()).error).toContain("Atlantis");
  });

  it("returns 502 when the air service is down", async () => {
    mockedAir.mockRejectedValue(new AirDataError("down", "upstream"));
    expect((await call({ profile: validProfile() })).status).toBe(502);
  });

  it("returns 500 for unexpected errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedAir.mockRejectedValue(new Error("kaboom"));
    expect((await call({ profile: validProfile() })).status).toBe(500);
  });

  it("returns 429 with Retry-After after 10 requests from one address", async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) expect((await call({ profile: validProfile() }, ip)).status).toBe(200);
    const blocked = await call({ profile: validProfile() }, ip);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    // A different address is unaffected.
    expect((await call({ profile: validProfile() })).status).toBe(200);
  });
});
