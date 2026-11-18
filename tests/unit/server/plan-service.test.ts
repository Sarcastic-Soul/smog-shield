import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFallbackPlan } from "@/lib/domain/fallback-plan";
import { buildInsights } from "@/lib/domain/insights";
import type { Plan } from "@/lib/domain/plan";
import { createPlanService, type PlanDeps } from "@/lib/server/plan-service";
import { delhiReport } from "../../fixtures/delhi";
import { makeProfile } from "../../fixtures/profiles";

const profile = makeProfile();
const report = delhiReport();
const aiPlan: Plan = buildFallbackPlan(profile, report, buildInsights(profile, report));
aiPlan.headline = "Written by the model";

function setup(generated: Plan | null) {
  const getAirReport = vi.fn<PlanDeps["getAirReport"]>(async () => delhiReport());
  const generatePlan = vi.fn<PlanDeps["generatePlan"]>(async () => generated);
  return { getAirReport, generatePlan, service: createPlanService({ getAirReport, generatePlan }) };
}

afterEach(() => vi.useRealTimers());

describe("createPlanService.planFor", () => {
  it("uses the AI plan when generatePlan returns one", async () => {
    const { service } = setup(aiPlan);
    const result = await service.planFor(profile);
    expect(result.source).toBe("gemini");
    expect(result.plan.headline).toBe("Written by the model");
    expect(result.report.place.name).toBe("New Delhi");
    expect(result.insights.band.id).toBe("sensitive");
  });

  it("falls back to rules when generatePlan returns null", async () => {
    const { service } = setup(null);
    const result = await service.planFor(profile);
    expect(result.source).toBe("rules");
    expect(result.plan.headline).toContain("New Delhi");
  });

  it("passes the profile city to getAirReport and the facts to generatePlan", async () => {
    const { service, getAirReport, generatePlan } = setup(null);
    await service.planFor({ ...profile, notes: "football at 5pm" });
    expect(getAirReport).toHaveBeenCalledWith("New Delhi");
    const prompt = generatePlan.mock.calls[0][0];
    expect(prompt).toContain("FACTS:");
    expect(prompt).toContain("<household_notes>football at 5pm</household_notes>");
  });

  it("caches an AI plan: the second call does not call generatePlan", async () => {
    const { service, generatePlan } = setup(aiPlan);
    await service.planFor(profile);
    const second = await service.planFor(profile);
    expect(generatePlan).toHaveBeenCalledTimes(1);
    expect(second.source).toBe("gemini");
  });

  it("keeps an AI plan for an hour", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { service, generatePlan } = setup(aiPlan);
    await service.planFor(profile);
    vi.advanceTimersByTime(59 * 60_000);
    await service.planFor(profile);
    expect(generatePlan).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2 * 60_000);
    await service.planFor(profile);
    expect(generatePlan).toHaveBeenCalledTimes(2);
  });

  it("returns a rules plan made in the last minute without calling the AI again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { service, generatePlan } = setup(null);
    await service.planFor(profile);
    vi.advanceTimersByTime(30_000);
    const second = await service.planFor(profile);
    expect(second.source).toBe("rules");
    expect(generatePlan).toHaveBeenCalledTimes(1);
  });

  it("retries the AI once the 60 second rules window is over", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { service, generatePlan } = setup(null);
    await service.planFor(profile);
    vi.advanceTimersByTime(61_000);
    await service.planFor(profile);
    expect(generatePlan).toHaveBeenCalledTimes(2);
  });

  it("uses a different cache entry for a different household", async () => {
    const { service, generatePlan } = setup(aiPlan);
    await service.planFor(profile);
    await service.planFor({ ...profile, budget: "low" });
    expect(generatePlan).toHaveBeenCalledTimes(2);
  });

  it("shares one AI call between simultaneous requests", async () => {
    const { service, generatePlan } = setup(aiPlan);
    await Promise.all([service.planFor(profile), service.planFor(profile)]);
    expect(generatePlan).toHaveBeenCalledTimes(1);
  });

  it("fills an English AI plan up to 3 indoor hacks and 2 community actions", async () => {
    const thin: Plan = {
      ...aiPlan,
      indoorHacks: aiPlan.indoorHacks.slice(0, 2),
      communityActions: aiPlan.communityActions.slice(0, 1),
    };
    const { service } = setup(thin);
    const { plan } = await service.planFor(profile);
    expect(plan.indoorHacks.length).toBeGreaterThanOrEqual(3);
    expect(plan.communityActions.length).toBeGreaterThanOrEqual(2);
    expect(plan.indoorHacks[0]).toEqual(thin.indoorHacks[0]);
  });

  it("leaves a non-English AI plan as the model wrote it", async () => {
    const thin: Plan = {
      ...aiPlan,
      indoorHacks: aiPlan.indoorHacks.slice(0, 2),
      communityActions: aiPlan.communityActions.slice(0, 1),
    };
    const { service } = setup(thin);
    const { plan } = await service.planFor({ ...profile, language: "hi" });
    expect(plan.indoorHacks).toHaveLength(2);
    expect(plan.communityActions).toHaveLength(1);
  });

  it("lets air data errors reach the caller", async () => {
    const service = createPlanService({
      getAirReport: async () => {
        throw new Error("boom");
      },
      generatePlan: async () => null,
    });
    await expect(service.planFor(profile)).rejects.toThrow("boom");
  });
});

describe("createPlanService.factsFor", () => {
  it("returns the report, insights and the facts text without calling the AI", async () => {
    const { service, generatePlan } = setup(aiPlan);
    const facts = await service.factsFor(profile);
    expect(facts.report.place.name).toBe("New Delhi");
    expect(facts.insights.risk.level).toBe("high");
    expect(facts.text).toContain("US AQI 118");
    expect(generatePlan).not.toHaveBeenCalled();
  });
});

describe("createPlanService.planEvents", () => {
  const collect = async (service: ReturnType<typeof setup>["service"], p = profile) => {
    const events = [];
    for await (const event of service.planEvents(p, await service.factsFor(p))) events.push(event);
    return events;
  };

  it("sends a rules draft, then the Gemini plan", async () => {
    const { service } = setup(aiPlan);
    const events = await collect(service);
    expect(events.map((e) => [e.kind, e.result.source])).toEqual([
      ["draft", "rules"],
      ["final", "gemini"],
    ]);
    expect(events[1].result.plan.headline).toBe("Written by the model");
  });

  it("sends the rules plan twice (draft, final) when Gemini fails", async () => {
    const { service } = setup(null);
    const events = await collect(service);
    expect(events.map((e) => [e.kind, e.result.source])).toEqual([
      ["draft", "rules"],
      ["final", "rules"],
    ]);
  });

  it("sends the draft before Gemini finishes", async () => {
    let release!: (plan: Plan) => void;
    const generatePlan = vi.fn<PlanDeps["generatePlan"]>(() => new Promise((resolve) => (release = resolve)));
    const service = createPlanService({ getAirReport: async () => delhiReport(), generatePlan });
    const iterator = service.planEvents(profile, await service.factsFor(profile));
    const first = await iterator.next();
    expect(first.value?.kind).toBe("draft");
    const pending = iterator.next();
    await vi.waitFor(() => expect(generatePlan).toHaveBeenCalled());
    release(aiPlan);
    expect((await pending).value?.kind).toBe("final");
  });

  it("sends a single final event for a cached AI plan", async () => {
    const { service, generatePlan } = setup(aiPlan);
    await collect(service);
    const second = await collect(service);
    expect(second.map((e) => e.kind)).toEqual(["final"]);
    expect(second[0].result.source).toBe("gemini");
    expect(generatePlan).toHaveBeenCalledTimes(1);
  });

  it("sends a single final event for a recent rules plan", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { service, generatePlan } = setup(null);
    await collect(service);
    vi.advanceTimersByTime(30_000);
    const second = await collect(service);
    expect(second.map((e) => [e.kind, e.result.source])).toEqual([["final", "rules"]]);
    expect(generatePlan).toHaveBeenCalledTimes(1);
  });
});
