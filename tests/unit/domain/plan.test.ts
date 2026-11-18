import { describe, expect, it } from "vitest";
import { planSchema, type Plan } from "@/lib/domain/plan";
import { planResultFixture } from "../../fixtures/results";

const valid = (): Plan => structuredClone(planResultFixture().plan);

const step = (time: string, day: string = "today") => ({ time, day, activity: "Walk", why: "Clean air" });
const hack = (n: number) => ({ title: `Hack ${n}`, action: "Do it", impact: "Helps" });
const action = (n: number) => ({ who: `Group ${n}`, action: "Do it", impact: "Helps" });

describe("planSchema", () => {
  it("accepts a plan built by the rules", () => {
    expect(planSchema.safeParse(valid()).success).toBe(true);
  });

  describe("routine time", () => {
    const withTime = (time: string) =>
      planSchema.safeParse({ ...valid(), routine: [step(time), step("08:00"), step("09:00")] }).success;

    it.each(["00:00", "07:05", "19:59", "23:59"])("accepts %s", (time) => {
      expect(withTime(time)).toBe(true);
    });

    it.each(["24:00", "7:00", "12:60", "12-30", "noon", "12:5", ""])("rejects %j", (time) => {
      expect(withTime(time)).toBe(false);
    });
  });

  it("only allows today or tomorrow as the routine day", () => {
    const base = valid();
    expect(
      planSchema.safeParse({ ...base, routine: [step("07:00", "today"), step("08:00", "tomorrow"), step("09:00")] })
        .success,
    ).toBe(true);
    expect(
      planSchema.safeParse({ ...base, routine: [step("07:00", "yesterday"), step("08:00"), step("09:00")] }).success,
    ).toBe(false);
  });

  it("needs a day on every routine step", () => {
    const noDay: Partial<ReturnType<typeof step>> = step("07:00");
    delete noDay.day;
    expect(planSchema.safeParse({ ...valid(), routine: [noDay, step("08:00"), step("09:00")] }).success).toBe(false);
  });

  it("keeps the routine between 3 and 8 steps", () => {
    const steps = (n: number) => Array.from({ length: n }, (_, i) => step(`0${i}:00`));
    expect(planSchema.safeParse({ ...valid(), routine: steps(2) }).success).toBe(false);
    expect(planSchema.safeParse({ ...valid(), routine: steps(3) }).success).toBe(true);
    expect(planSchema.safeParse({ ...valid(), routine: steps(8) }).success).toBe(true);
    expect(planSchema.safeParse({ ...valid(), routine: steps(9) }).success).toBe(false);
  });

  it("keeps indoor hacks between 2 and 6", () => {
    const hacks = (n: number) => Array.from({ length: n }, (_, i) => hack(i));
    expect(planSchema.safeParse({ ...valid(), indoorHacks: hacks(1) }).success).toBe(false);
    expect(planSchema.safeParse({ ...valid(), indoorHacks: hacks(2) }).success).toBe(true);
    expect(planSchema.safeParse({ ...valid(), indoorHacks: hacks(6) }).success).toBe(true);
    expect(planSchema.safeParse({ ...valid(), indoorHacks: hacks(7) }).success).toBe(false);
  });

  it("keeps community actions between 1 and 4", () => {
    const actions = (n: number) => Array.from({ length: n }, (_, i) => action(i));
    expect(planSchema.safeParse({ ...valid(), communityActions: [] }).success).toBe(false);
    expect(planSchema.safeParse({ ...valid(), communityActions: actions(1) }).success).toBe(true);
    expect(planSchema.safeParse({ ...valid(), communityActions: actions(4) }).success).toBe(true);
    expect(planSchema.safeParse({ ...valid(), communityActions: actions(5) }).success).toBe(false);
  });

  it("requires communityActions to exist", () => {
    const rest: Partial<Plan> = valid();
    delete rest.communityActions;
    expect(planSchema.safeParse(rest).success).toBe(false);
  });

  it("limits text lengths and rejects blank text", () => {
    expect(planSchema.safeParse({ ...valid(), headline: "x".repeat(121) }).success).toBe(false);
    expect(planSchema.safeParse({ ...valid(), headline: "   " }).success).toBe(false);
  });

  it("allows no group advice but not more than 6 groups", () => {
    expect(planSchema.safeParse({ ...valid(), groupAdvice: [] }).success).toBe(true);
    const groups = Array.from({ length: 7 }, (_, i) => ({ group: `g${i}`, advice: "a" }));
    expect(planSchema.safeParse({ ...valid(), groupAdvice: groups }).success).toBe(false);
  });
});
