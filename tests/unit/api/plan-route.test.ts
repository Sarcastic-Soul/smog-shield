import { beforeEach, describe, expect, it, vi } from "vitest";
import { AirDataError } from "@/lib/air/fetch-json";
import { delhiReport } from "../../fixtures/delhi";
import type { PlanEvent } from "@/lib/domain/result";
import { planResultFixture } from "../../fixtures/results";
import { freshIp, jsonRequest, validProfile } from "./helpers";

const mocks = vi.hoisted(() => ({
  getAirReport: vi.fn(),
  generatePlan: vi.fn(),
  assistant: null as null | {
    isAvailable: () => boolean;
    generatePlan: () => unknown;
    streamAnswer: (...a: unknown[]) => AsyncGenerator<string>;
  },
}));

// Same wiring as src/lib/server/services.ts, but with fakes for Gemini and the air service.
vi.mock("@/lib/server/services", async () => {
  const { createPlanService } =
    await vi.importActual<typeof import("@/lib/server/plan-service")>("@/lib/server/plan-service");
  const { createRateLimiter } =
    await vi.importActual<typeof import("@/lib/server/rate-limit")>("@/lib/server/rate-limit");
  return {
    get assistant() {
      return mocks.assistant;
    },
    planService: createPlanService({
      getAirReport: (city: string) => mocks.getAirReport(city),
      generatePlan: (prompt: string) => mocks.generatePlan(prompt),
    }),
    planLimiter: createRateLimiter(10, 60_000),
    askLimiter: createRateLimiter(20, 60_000),
  };
});

const { POST } = await import("@/app/api/plan/route");
const mockedAir = mocks.getAirReport;
const mockedGenerate = mocks.generatePlan;

async function readEvents(response: Response): Promise<PlanEvent[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as PlanEvent);
}

const call = (body: unknown, ip?: string) => POST(jsonRequest("http://test.local/api/plan", body, ip));

beforeEach(() => {
  mockedAir.mockReset();
  mockedAir.mockResolvedValue(delhiReport());
  mockedGenerate.mockReset();
  mockedGenerate.mockResolvedValue(null);
});

describe("POST /api/plan", () => {
  it("streams NDJSON: a rules draft, then the final plan", async () => {
    const response = await call({ profile: validProfile() });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/x-ndjson");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const events = await readEvents(response);
    expect(events.map((e) => e.kind)).toEqual(["draft", "final"]);
    const { result } = events[1];
    expect(result.report.place.name).toBe("New Delhi");
    expect(result.insights.band.id).toBe("sensitive");
    expect(result.plan.routine.length).toBeGreaterThanOrEqual(3);
    expect(result.source).toBe("rules");
    expect(events[0].result.source).toBe("rules");
  });

  it("sends the Gemini plan as the final event", async () => {
    const plan = planResultFixture().plan;
    mockedGenerate.mockResolvedValueOnce({ ...plan, headline: "From Gemini" });
    const events = await readEvents(await call({ profile: { ...validProfile(), city: "Gemini City" } }));
    expect(events.map((e) => e.kind)).toEqual(["draft", "final"]);
    expect(events[1].result.source).toBe("gemini");
    expect(events[1].result.plan.headline).toBe("From Gemini");
  });

  it("sends a single final event for a cached answer", async () => {
    const profile = { ...validProfile(), city: "Cached Town" };
    await readEvents(await call({ profile }));
    const second = await readEvents(await call({ profile }));
    expect(second.map((e) => e.kind)).toEqual(["final"]);
  });

  it("ends the stream quietly when planning fails midway", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockedGenerate.mockImplementationOnce(() => {
      throw new Error("sync boom");
    });
    // generatePlan errors are caught inside the service, so the stream still finishes.
    const events = await readEvents(await call({ profile: { ...validProfile(), city: "Boom Town" } }));
    expect(events.at(-1)?.kind).toBe("final");
  });

  it("looks the city up by the trimmed name from the profile", async () => {
    await call({ profile: { ...validProfile(), city: "  New Delhi " } });
    expect(mockedAir).toHaveBeenCalledWith("New Delhi");
  });

  it("returns 403 for a cross-site request before reading the body", async () => {
    const request = new Request("http://test.local/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: "{}",
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(mockedAir).not.toHaveBeenCalled();
  });

  it("returns 413 for an oversized body declared by content-length", async () => {
    const request = new Request("http://test.local/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": "99999" },
      body: "{}",
    });
    expect((await POST(request)).status).toBe(413);
  });

  it("rate limits before reading the body, so bad bodies use up slots", async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) expect((await call("{nope", ip)).status).toBe(400);
    expect((await call({ profile: validProfile() }, ip)).status).toBe(429);
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
    for (let i = 0; i < 10; i++) {
      const ok = await call({ profile: validProfile() }, ip);
      expect(ok.status).toBe(200);
      await ok.text();
    }
    const blocked = await call({ profile: validProfile() }, ip);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    // A different address is unaffected.
    expect((await call({ profile: validProfile() })).status).toBe(200);
  });

  it("exports a preferred region", async () => {
    const route = await import("@/app/api/plan/route");
    expect(route.preferredRegion).toBe("bom1");
  });

  it("returns facts errors as JSON status codes before streaming", async () => {
    mockedAir.mockRejectedValue(new AirDataError("down", "upstream"));
    const response = await call({ profile: validProfile() });
    expect(response.status).toBe(502);
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });

  it("exports a max duration above the 18 s plan budget", async () => {
    const route = await import("@/app/api/plan/route");
    expect(route.maxDuration).toBeGreaterThanOrEqual(20);
  });

  it("returns the outlook and community facts in the insights", async () => {
    const events = await readEvents(await call({ profile: validProfile() }));
    const { insights, plan } = events.at(-1)!.result;
    expect(insights.outlook.days).toHaveLength(3);
    expect(insights.community?.households).toBe(40);
    expect(plan.communityActions.length).toBeGreaterThanOrEqual(1);
  });
});
