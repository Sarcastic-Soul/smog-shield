import { describe, expect, it } from "vitest";
import { buildFallbackPlan, reconcilePlan, scheduleFromNow } from "@/lib/domain/fallback-plan";
import { buildInsights } from "@/lib/domain/insights";
import { planSchema, type Plan } from "@/lib/domain/plan";
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

const step = (time: string) => ({ time, activity: `Step at ${time}`, why: "Because" });

describe("scheduleFromNow", () => {
  it("marks steps still ahead as today and passed steps as tomorrow", () => {
    const result = scheduleFromNow([step("07:00"), step("12:00"), step("22:00")], "2026-01-15T10:00");
    expect(result.map((r) => [r.time, r.day])).toEqual([
      ["12:00", "today"],
      ["22:00", "today"],
      ["07:00", "tomorrow"],
    ]);
  });

  it("keeps a step at exactly the current time as today", () => {
    const result = scheduleFromNow([step("10:00"), step("09:59")], "2026-01-15T10:00");
    expect(result.map((r) => [r.time, r.day])).toEqual([
      ["10:00", "today"],
      ["09:59", "tomorrow"],
    ]);
  });

  it("uses the minutes of the current time, not only the hour", () => {
    const result = scheduleFromNow([step("10:15"), step("10:45")], "2026-01-15T10:30");
    expect(result.map((r) => r.day)).toEqual(["today", "tomorrow"]);
  });

  it("sorts each day by time", () => {
    const result = scheduleFromNow([step("19:30"), step("08:30"), step("12:00"), step("07:00")], "2026-01-15T10:00");
    expect(result.map((r) => r.time)).toEqual(["12:00", "19:30", "07:00", "08:30"]);
  });

  it("puts everything on today late at night only for steps that are still ahead", () => {
    const result = scheduleFromNow([step("23:00"), step("06:00")], "2026-01-15T22:30");
    expect(result.map((r) => [r.time, r.day])).toEqual([
      ["23:00", "today"],
      ["06:00", "tomorrow"],
    ]);
  });

  it("returns an empty list for no steps", () => {
    expect(scheduleFromNow([], "2026-01-15T10:00")).toEqual([]);
  });
});

describe("reconcilePlan", () => {
  const fallback = planFor(makeProfile({ home: { ...makeProfile().home, smokerAtHome: true, cooking: "biomass" } }));
  const base = planFor(makeProfile());
  const hack = (title: string) => ({ title, action: "a", impact: "i" });
  const community = (who: string) => ({ who, action: "a", impact: "i" });

  it("fills up to 3 indoor hacks and 2 community actions, keeping the model's items first", () => {
    const ai: Plan = { ...base, indoorHacks: [hack("Mine")], communityActions: [community("My group")] };
    const result = reconcilePlan(ai, fallback);
    expect(result.indoorHacks).toHaveLength(3);
    expect(result.indoorHacks[0].title).toBe("Mine");
    expect(result.communityActions).toHaveLength(2);
    expect(result.communityActions[0].who).toBe("My group");
  });

  it("does not add items whose title matches ignoring case", () => {
    const title = fallback.indoorHacks[0].title;
    const ai: Plan = { ...base, indoorHacks: [hack(title.toUpperCase()), hack("Other")] };
    const result = reconcilePlan(ai, fallback);
    const titles = result.indoorHacks.map((h) => h.title.toLowerCase());
    expect(new Set(titles).size).toBe(titles.length);
    expect(titles).toHaveLength(3);
  });

  it("leaves a plan that already meets the minimum unchanged", () => {
    const ai: Plan = {
      ...base,
      indoorHacks: [hack("a"), hack("b"), hack("c"), hack("d")],
      communityActions: [community("x"), community("y"), community("z")],
    };
    const result = reconcilePlan(ai, fallback);
    expect(result.indoorHacks).toEqual(ai.indoorHacks);
    expect(result.communityActions).toEqual(ai.communityActions);
  });

  it("never exceeds 6 hacks or 4 community actions", () => {
    const ai: Plan = {
      ...base,
      indoorHacks: Array.from({ length: 6 }, (_, i) => hack(`h${i}`)),
      communityActions: Array.from({ length: 4 }, (_, i) => community(`c${i}`)),
    };
    const result = reconcilePlan(ai, fallback);
    expect(result.indoorHacks).toHaveLength(6);
    expect(result.communityActions).toHaveLength(4);
  });

  it("keeps every other field from the model", () => {
    const ai: Plan = { ...base, headline: "Model headline", indoorHacks: [hack("Mine")] };
    const result = reconcilePlan(ai, fallback);
    expect(result.headline).toBe("Model headline");
    expect(result.routine).toEqual(ai.routine);
    expect(result.alternatives).toEqual(ai.alternatives);
    expect(planSchema.safeParse(result).success).toBe(true);
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
    expect(burning.communityActions.at(-1)?.action).toMatch(/Report the waste burning/);
    const quiet = planFor(makeProfile());
    expect(quiet.communityActions.at(-1)?.action).toMatch(/no-burning rule/);
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
