import { describe, expect, it } from "vitest";
import { buildFallbackPlan } from "@/lib/domain/fallback-plan";
import { buildInsights } from "@/lib/domain/insights";
import { planSchema, type Plan } from "@/lib/domain/plan";
import type { Profile } from "@/lib/domain/profile-options";
import { reconcilePlan } from "@/lib/domain/rules/reconcile";
import { delhiReport } from "../../../fixtures/delhi";
import { makeProfile } from "../../../fixtures/profiles";

function setup(profile: Profile) {
  const report = delhiReport();
  const insights = buildInsights(profile, report);
  return {
    profile,
    swaps: insights.commute.swaps,
    plan: buildFallbackPlan(profile, report, insights),
  };
}

const hack = (title: string) => ({ title, action: "a", impact: "i" });
const community = (who: string) => ({ who, action: "a", impact: "i" });
const alt = (swap: string, action = "a") => ({ swap, action, impact: "i" });

describe("reconcilePlan", () => {
  const rich = setup(makeProfile({ home: { ...makeProfile().home, smokerAtHome: true, cooking: "biomass" } }));
  const { plan: base, profile, swaps } = setup(makeProfile());
  const fallback = rich.plan;
  const context = { profile, swaps };

  it("fills up to 3 indoor hacks and 2 community actions, keeping the model's items first", () => {
    const ai: Plan = { ...base, indoorHacks: [hack("Mine")], communityActions: [community("My group")] };
    const result = reconcilePlan(ai, fallback, context);
    expect(result.indoorHacks).toHaveLength(3);
    expect(result.indoorHacks[0].title).toBe("Mine");
    expect(result.communityActions).toHaveLength(2);
    expect(result.communityActions[0].who).toBe("My group");
  });

  it("does not add items whose title matches ignoring case", () => {
    const title = fallback.indoorHacks[0].title;
    const ai: Plan = { ...base, indoorHacks: [hack(title.toUpperCase()), hack("Other")] };
    const titles = reconcilePlan(ai, fallback, context).indoorHacks.map((h) => h.title.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles).toHaveLength(3);
  });

  it("leaves a plan that already meets the minimum unchanged", () => {
    const ai: Plan = {
      ...base,
      indoorHacks: [hack("a"), hack("b"), hack("c"), hack("d")],
      communityActions: [community("x"), community("y"), community("z")],
    };
    const result = reconcilePlan(ai, fallback, context);
    expect(result.indoorHacks).toEqual(ai.indoorHacks);
    expect(result.communityActions).toEqual(ai.communityActions);
  });

  it("never exceeds 6 hacks or 4 community actions", () => {
    const ai: Plan = {
      ...base,
      indoorHacks: Array.from({ length: 6 }, (_, i) => hack(`h${i}`)),
      communityActions: Array.from({ length: 4 }, (_, i) => community(`c${i}`)),
    };
    const result = reconcilePlan(ai, fallback, context);
    expect(result.indoorHacks).toHaveLength(6);
    expect(result.communityActions).toHaveLength(4);
  });

  it("keeps every other field from the model", () => {
    const ai: Plan = { ...base, headline: "Model headline", indoorHacks: [hack("Mine")] };
    const result = reconcilePlan(ai, fallback, context);
    expect(result.headline).toBe("Model headline");
    expect(result.routine).toEqual(ai.routine);
    expect(result.alternatives.slice(0, ai.alternatives.length)).toEqual(ai.alternatives);
    expect(planSchema.safeParse(result).success).toBe(true);
  });
});

describe("reconcilePlan swap top-up", () => {
  const { plan: base, profile, swaps } = setup(makeProfile());
  const context = { profile, swaps };

  it("adds rule swaps whose target mode the model did not mention", () => {
    const ai: Plan = { ...base, alternatives: [alt("Petrol car → Bus", "Take the bus")] };
    const result = reconcilePlan(ai, base, context);
    expect(result.alternatives[0].swap).toBe("Petrol car → Bus");
    const swapNames = result.alternatives.map((a) => a.swap);
    expect(swapNames.some((s) => /Metro/.test(s))).toBe(true);
    expect(swapNames.filter((s) => /Bus/.test(s))).toHaveLength(1);
  });

  it("builds the added swaps from the swaps given in the context", () => {
    const ai: Plan = { ...base, alternatives: [alt("Mine", "nothing relevant")] };
    const result = reconcilePlan(ai, base, context);
    const top = swaps.slice(0, 3);
    expect(result.alternatives).toHaveLength(1 + top.length);
    expect(result.alternatives[1].impact).toContain(`${top[0].co2KgSavedPerWeek} kg`);
  });

  it("adds nothing when the context has no swaps", () => {
    const ai: Plan = { ...base, alternatives: [alt("Mine", "nothing relevant")] };
    expect(reconcilePlan(ai, base, { profile, swaps: [] }).alternatives).toEqual(ai.alternatives);
  });

  it("only considers the top 3 swaps", () => {
    const ai: Plan = { ...base, alternatives: [alt("Mine", "nothing relevant")] };
    const extra = [...swaps, ...swaps, ...swaps];
    expect(reconcilePlan(ai, base, { profile, swaps: extra }).alternatives.length).toBeLessThanOrEqual(4);
  });

  it("treats a mention in the action text as covered, ignoring case", () => {
    const ai: Plan = {
      ...base,
      alternatives: [alt("Something else", "Use METRO or the BUS or a cng car or WALK or a BICYCLE or work from home")],
    };
    expect(reconcilePlan(ai, base, context).alternatives).toEqual(ai.alternatives);
  });

  it("never exceeds the alternatives limit", () => {
    const ai: Plan = { ...base, alternatives: Array.from({ length: 5 }, (_, i) => alt(`x${i}`, "nothing")) };
    expect(reconcilePlan(ai, base, context).alternatives).toHaveLength(5);
  });
});
