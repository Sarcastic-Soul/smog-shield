import { describe, expect, it, vi } from "vitest";
import { buildFallbackPlan } from "@/lib/domain/fallback-plan";
import { buildInsights } from "@/lib/domain/insights";
import type { Plan } from "@/lib/domain/plan";
import { createPlanService } from "@/lib/server/plan-service";
import { delhiReport } from "../../fixtures/delhi";
import { makeProfile } from "../../fixtures/profiles";

const profile = makeProfile();
const report = delhiReport();
const aiPlan: Plan = buildFallbackPlan(profile, report, buildInsights(profile, report));
aiPlan.headline = "Written by the model";

function setup(generated: Plan | null) {
  const getAirReport = vi.fn(async () => delhiReport());
  const generatePlan = vi.fn(async () => generated);
  return { getAirReport, generatePlan, planFor: createPlanService({ getAirReport, generatePlan }) };
}

describe("createPlanService", () => {
  it("uses the AI plan when generatePlan returns one", async () => {
    const { planFor } = setup(aiPlan);
    const result = await planFor(profile, "new delhi");
    expect(result.source).toBe("gemini");
    expect(result.plan.headline).toBe("Written by the model");
    expect(result.report.place.name).toBe("New Delhi");
    expect(result.insights.band.id).toBe("sensitive");
  });

  it("falls back to rules when generatePlan returns null", async () => {
    const { planFor } = setup(null);
    const result = await planFor(profile, "new delhi");
    expect(result.source).toBe("rules");
    expect(result.plan.headline).toContain("New Delhi");
  });

  it("passes the city key to getAirReport and the facts to generatePlan", async () => {
    const { planFor, getAirReport, generatePlan } = setup(null);
    await planFor({ ...profile, notes: "football at 5pm" }, "new delhi");
    expect(getAirReport).toHaveBeenCalledWith("new delhi");
    const prompt = (generatePlan.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain("FACTS:");
    expect(prompt).toContain("<household_notes>football at 5pm</household_notes>");
  });

  it("caches an AI plan: the second call does not call generatePlan", async () => {
    const { planFor, generatePlan } = setup(aiPlan);
    await planFor(profile, "new delhi");
    const second = await planFor(profile, "new delhi");
    expect(generatePlan).toHaveBeenCalledTimes(1);
    expect(second.source).toBe("gemini");
  });

  it("does not cache rule-based plans, so Gemini is retried", async () => {
    const { planFor, generatePlan } = setup(null);
    await planFor(profile, "new delhi");
    await planFor(profile, "new delhi");
    expect(generatePlan).toHaveBeenCalledTimes(2);
  });

  it("uses a different cache entry for a different household", async () => {
    const { planFor, generatePlan } = setup(aiPlan);
    await planFor(profile, "new delhi");
    await planFor({ ...profile, budget: "low" }, "new delhi");
    expect(generatePlan).toHaveBeenCalledTimes(2);
  });

  it("lets air data errors reach the caller", async () => {
    const planFor = createPlanService({
      getAirReport: async () => {
        throw new Error("boom");
      },
      generatePlan: async () => null,
    });
    await expect(planFor(profile, "x")).rejects.toThrow("boom");
  });
});
