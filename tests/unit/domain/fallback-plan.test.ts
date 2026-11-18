import { describe, expect, it } from "vitest";
import { buildFallbackPlan } from "@/lib/domain/fallback-plan";
import { buildInsights } from "@/lib/domain/insights";
import { planSchema } from "@/lib/domain/plan";
import type { Profile } from "@/lib/domain/profile";
import { delhiReport } from "../../fixtures/delhi";
import { healthyProfile, makeProfile } from "../../fixtures/profiles";

const planFor = (profile: Profile) => {
  const report = delhiReport();
  return buildFallbackPlan(profile, report, buildInsights(profile, report));
};

describe("buildFallbackPlan", () => {
  it("produces output that passes planSchema for the default household", () => {
    expect(() => planSchema.parse(planFor(makeProfile()))).not.toThrow();
  });

  it.each([
    ["work from home", makeProfile({ commute: { mode: "work_from_home", distanceKm: 0, daysPerWeek: 0 } })],
    ["no exercise", makeProfile({ home: { ...makeProfile().home, outdoorExerciseMinutes: 0 } })],
    ["healthy adults", healthyProfile()],
    ["cyclist", makeProfile({ commute: { mode: "bicycle", distanceKm: 3, daysPerWeek: 5 } })],
    ["biomass cooking", makeProfile({ home: { ...makeProfile().home, cooking: "biomass" } })],
  ])("passes planSchema for %s", (_name, profile) => {
    expect(() => planSchema.parse(planFor(profile))).not.toThrow();
  });

  it("sorts the routine by time", () => {
    const times = planFor(makeProfile()).routine.map((r) => r.time);
    expect(times).toEqual([...times].sort());
  });

  it("adds a cooking hack for polluting fuels, and not for LPG", () => {
    const biomass = planFor(makeProfile({ home: { ...makeProfile().home, cooking: "biomass" } }));
    const lpg = planFor(makeProfile());
    expect(biomass.indoorHacks[0].title).toMatch(/Move cooking/);
    expect(lpg.indoorHacks.some((h) => /Move cooking/.test(h.title))).toBe(false);
  });

  it("uses the purifier wording based on ownership", () => {
    const base = makeProfile();
    const own = planFor(makeProfile({ home: { ...base.home, hasPurifier: true } }));
    const none = planFor(base);
    expect(own.indoorHacks[0].title).toMatch(/Run your purifier/);
    expect(none.indoorHacks[0].title).toMatch(/Make one clean room/);
  });

  it("gives swaps with numbers, and a non-commute swap when none exist", () => {
    const withSwaps = planFor(makeProfile());
    expect(withSwaps.alternatives[0].impact).toMatch(/kg CO₂/);
    const none = planFor(makeProfile({ commute: { mode: "work_from_home", distanceKm: 0, daysPerWeek: 0 } }));
    expect(none.alternatives[0].swap).toMatch(/burning/i);
  });

  it("builds one group advice per sensitive group", () => {
    expect(planFor(makeProfile()).groupAdvice.map((g) => g.group)).toEqual([
      "children",
      "older adults",
      "someone with asthma",
    ]);
    expect(planFor(healthyProfile()).groupAdvice).toEqual([]);
  });

  it("puts the headline place and AQI in the output", () => {
    const plan = planFor(makeProfile());
    expect(plan.headline).toContain("New Delhi");
    expect(plan.summary).toContain("PM2.5 at 62");
  });

  it("flags a mask in the commute step when risk is high", () => {
    const commute = planFor(makeProfile()).routine.find((r) => r.time === "08:30");
    expect(commute?.activity).toMatch(/N95/);
  });
});

describe("safety alerts feeding the plan", () => {
  it("raises a carbon monoxide alert for coal or wood heating", () => {
    const profile = makeProfile({ home: { ...makeProfile().home, heating: "coal_or_wood" } });
    const insights = buildInsights(profile, delhiReport());
    expect(insights.safetyAlerts.join(" ")).toMatch(/carbon monoxide/i);
  });

  it("raises a nitrogen dioxide alert for unflued gas heaters", () => {
    const profile = makeProfile({ home: { ...makeProfile().home, heating: "gas_heater" } });
    expect(buildInsights(profile, delhiReport()).safetyAlerts.join(" ")).toMatch(/nitrogen dioxide/i);
  });

  it("raises no heating alert for an electric heater", () => {
    expect(buildInsights(makeProfile(), delhiReport()).safetyAlerts).toEqual([]);
  });
});
