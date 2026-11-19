import { describe, expect, it } from "vitest";
import { buildFallbackPlan } from "@/lib/domain/fallback-plan";
import { buildInsights } from "@/lib/domain/insights";
import { planSchema, type Plan } from "@/lib/domain/plan";
import type { Profile } from "@/lib/domain/profile-options";
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

  it("orders the routine from now: today's steps by time, then tomorrow's", () => {
    const routine = planFor(makeProfile()).routine;
    const days = routine.map((r) => r.day);
    expect(days).toEqual([...days].sort((a, b) => (a === b ? 0 : a === "today" ? -1 : 1)));
    for (const day of ["today", "tomorrow"] as const) {
      const times = routine.filter((r) => r.day === day).map((r) => r.time);
      expect(times).toEqual([...times].sort());
    }
    expect(routine[0].time).toBe("12:00");
    expect(routine.at(-1)).toMatchObject({ time: "08:30", day: "tomorrow" });
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
    // No commute swaps and no burning: the cooking swap fills in.
    expect(none.alternatives[0].swap).toBe("Open pot → pressure cooker");
    const burning = planFor(
      makeProfile({
        commute: { mode: "work_from_home", distanceKm: 0, daysPerWeek: 0 },
        home: { ...makeProfile().home, wasteBurningNearby: true },
      }),
    );
    expect(burning.alternatives[0].swap).toMatch(/burning/i);
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
    expect(plan.summary).toContain("PM2.5 is 62");
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

describe("fallback plan content", () => {
  const homeOf = () => makeProfile().home;

  it("adds a take-smoking-outside hack when someone smokes at home", () => {
    const plan = planFor(makeProfile({ home: { ...homeOf(), smokerAtHome: true } }));
    expect(plan.indoorHacks[0].title).toBe("Take smoking outside");
    expect(plan.indoorHacks.length).toBeLessThanOrEqual(6);
  });

  it("builds community actions that fit the household", () => {
    const withKids = planFor(makeProfile());
    expect(withKids.communityActions.map((a) => a.who)).toEqual([
      "Your building or lane",
      "Your child's school",
      "Your resident welfare association",
    ]);
    expect(withKids.communityActions[0].impact).toMatch(/40 homes/);

    const noKids = planFor(healthyProfile());
    expect(noKids.communityActions.some((a) => /school/.test(a.who))).toBe(false);
    expect(noKids.communityActions.length).toBeGreaterThanOrEqual(1);
  });

  it("asks to report burning when waste burning is nearby", () => {
    const burning = planFor(makeProfile({ home: { ...homeOf(), wasteBurningNearby: true } }));
    expect(burning.communityActions.at(-1)?.action).toMatch(/Report the burning/);
    const quiet = planFor(makeProfile());
    expect(quiet.communityActions.at(-1)?.action).toMatch(/purifier-equipped room/);
  });

  it("skips the building action when there is no commute swap", () => {
    const plan = planFor(makeProfile({ commute: { mode: "bicycle", distanceKm: 3, daysPerWeek: 5 } }));
    expect(plan.communityActions.some((a) => a.who === "Your building or lane")).toBe(false);
  });

  it("adds a mask line to group advice at high risk only", () => {
    const high = planFor(makeProfile());
    expect(high.groupAdvice[0].advice).toMatch(/child-size N95/);
    expect(high.groupAdvice[1].advice).toMatch(/snug N95/);

    const report = delhiReport();
    const calm = { ...report, now: { ...report.now, aqi: 70 } };
    const profile = makeProfile();
    const plan = buildFallbackPlan(profile, calm, buildInsights(profile, calm));
    expect(plan.groupAdvice.every((g) => !/N95/.test(g.advice))).toBe(true);
  });

  it("suggests swapping a heater instead of composting when there is a heating hazard", () => {
    const plan = planFor(makeProfile({ home: { ...homeOf(), heating: "gas_heater" } }));
    expect(plan.alternatives.at(-1)?.swap).toMatch(/heater/);
  });

  it("keeps windows shut in the morning on smoggy days and airs out on clean ones", () => {
    const report = delhiReport();
    const profile = makeProfile();
    const smoggy = { ...report, now: { ...report.now, aqi: 180 } };
    const clean = { ...report, now: { ...report.now, aqi: 60 } };
    const morning = (r: typeof report) =>
      buildFallbackPlan(profile, r, buildInsights(profile, r)).routine.find((s) => s.time === "07:00")!.activity;
    expect(morning(smoggy)).toMatch(/windows shut/);
    expect(morning(clean)).toMatch(/Air out/);
  });

  it("drops the commute step for work from home", () => {
    const plan = planFor(makeProfile({ commute: { mode: "work_from_home", distanceKm: 0, daysPerWeek: 0 } }));
    expect(plan.routine.some((s) => s.time === "08:30")).toBe(false);
  });
});

describe("fallback plan: new rules", () => {
  const homeOf = () => makeProfile().home;
  const stepTimes = (p: Plan) => p.routine.map((r) => r.time);

  it("uses sentence-case mode names in the commute step and swap actions", () => {
    const plan = planFor(makeProfile());
    expect(plan.routine.find((r) => r.time === "08:30")?.activity).toBe("Commute by petrol car with an N95 on");
    expect(plan.alternatives.some((a) => a.action === "Take the bus for your 12 km trip.")).toBe(true);
    expect(plan.alternatives.some((a) => a.action === "Take the CNG car for your 12 km trip.")).toBe(true);
  });

  it("skips the worst-window step when the worst window is not above AQI 100", () => {
    const report = delhiReport();
    const clean = {
      ...report,
      now: { ...report.now, aqi: 60 },
      next24h: report.next24h.map((h) => ({ ...h, aqi: 60, pm25: 20 })),
    };
    const profile = makeProfile();
    const plan = buildFallbackPlan(profile, clean, buildInsights(profile, clean));
    expect(plan.routine.some((r) => /Stay inside, keep doors closed/.test(r.activity))).toBe(false);
    expect(planFor(profile).routine.some((r) => /Stay inside, keep doors closed/.test(r.activity))).toBe(true);
  });

  it("adds an indoor exercise step on severe risk, using the box-fan filter without a purifier", () => {
    const report = delhiReport();
    const severe = { ...report, now: { ...report.now, aqi: 320, pm25: 250 } };
    const profile = makeProfile();
    const insights = buildInsights(profile, severe);
    expect(insights.risk.level).toBe("severe");
    const plan = buildFallbackPlan(profile, severe, insights);
    const step = plan.routine.find((r) => r.time === "17:30");
    expect(step?.activity).toBe("Do your 45-min exercise indoors with a box-fan filter on");
    expect(plan.routine.some((r) => /Run errands or school pick-up/.test(r.activity))).toBe(true);
    const owned = makeProfile({ home: { ...profile.home, hasPurifier: true } });
    const ownedPlan = buildFallbackPlan(owned, severe, buildInsights(owned, severe));
    expect(ownedPlan.routine.find((r) => r.time === "17:30")?.activity).toContain("with the purifier on");
  });

  it("adds a step for a time named in the notes", () => {
    const plan = planFor(makeProfile({ notes: "football at 4:30pm" }));
    const step = plan.routine.find((r) => r.time === "16:30");
    expect(step?.activity).toContain("Your plan at 16:30");
    expect(step?.activity).toContain("12:00");
    expect(stepTimes(planFor(makeProfile()))).not.toContain("16:30");
  });

  it("drops a note step that clashes with a fixed time", () => {
    const plan = planFor(makeProfile({ notes: "gym at 7am" }));
    expect(plan.routine.filter((r) => r.time === "07:00")).toHaveLength(1);
  });

  it("adds the composting swap only when waste burns nearby", () => {
    const burning = planFor(makeProfile({ home: { ...homeOf(), wasteBurningNearby: true } }));
    expect(burning.alternatives.some((a) => /composting/.test(a.swap))).toBe(true);
    expect(planFor(makeProfile()).alternatives.some((a) => /composting/.test(a.swap))).toBe(false);
  });

  it("swaps polluting cooking for LPG or induction; otherwise adds the pressure cooker only when short of 3 swaps", () => {
    const biomass = planFor(makeProfile({ home: { ...homeOf(), cooking: "biomass" } }));
    expect(biomass.alternatives.some((a) => /→ LPG or induction/.test(a.swap))).toBe(true);
    expect(biomass.alternatives.some((a) => /pressure cooker/.test(a.swap))).toBe(false);

    const lpg = planFor(makeProfile());
    expect(lpg.alternatives.some((a) => /pressure cooker/.test(a.swap))).toBe(false);

    const few = planFor(makeProfile({ commute: { mode: "bicycle", distanceKm: 3, daysPerWeek: 5 } }));
    expect(few.alternatives.some((a) => /pressure cooker/.test(a.swap))).toBe(true);
  });

  it("varies the RWA action by waste burning", () => {
    const quiet = planFor(makeProfile()).communityActions.at(-1);
    const burning = planFor(makeProfile({ home: { ...homeOf(), wasteBurningNearby: true } })).communityActions.at(-1);
    expect(quiet?.action).not.toBe(burning?.action);
  });

  it("names the main pollutant in the summary when it is not PM2.5", () => {
    const report = delhiReport();
    const profile = makeProfile();
    const ozone = { ...report, now: { ...report.now, dominant: "ozone" as const } };
    const plan = buildFallbackPlan(profile, ozone, buildInsights(profile, ozone));
    expect(plan.summary).toContain("driven mostly by ozone");
    expect(planFor(profile).summary).toContain("driven by fine particles");
  });

  it("picks the first shared swap for the building action, not work from home", () => {
    const plan = planFor(makeProfile());
    expect(plan.communityActions[0].action).toContain("shared bus trip");
  });
});
