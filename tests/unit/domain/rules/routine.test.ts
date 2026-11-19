import { describe, expect, it } from "vitest";
import { scheduleFromNow } from "@/lib/domain/rules/routine";

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
