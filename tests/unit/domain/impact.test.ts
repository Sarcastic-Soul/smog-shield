import { describe, expect, it } from "vitest";
import {
  commuteSwaps,
  exerciseShift,
  indoorEstimate,
  maskEffect,
  weeklyCommuteKm,
} from "@/lib/domain/impact";
import { makeProfile } from "../../fixtures/profiles";

function commuteProfile(mode: string, distanceKm: number, daysPerWeek = 5) {
  const base = makeProfile();
  return { ...base, commute: { mode: mode as typeof base.commute.mode, distanceKm, daysPerWeek } };
}

describe("weeklyCommuteKm", () => {
  it("counts the trip both ways", () => {
    expect(weeklyCommuteKm(commuteProfile("car_petrol", 12, 5))).toBe(120);
  });

  it("is zero when working from home, whatever the distance", () => {
    expect(weeklyCommuteKm(commuteProfile("work_from_home", 30, 5))).toBe(0);
  });
});

describe("commuteSwaps", () => {
  it("returns no swaps for work from home", () => {
    expect(commuteSwaps(commuteProfile("work_from_home", 10))).toEqual([]);
  });

  it("returns no swaps for a zero-km commute", () => {
    expect(commuteSwaps(commuteProfile("car_petrol", 0))).toEqual([]);
  });

  it("returns no swaps for someone already on a bicycle", () => {
    expect(commuteSwaps(commuteProfile("bicycle", 3))).toEqual([]);
  });

  it("only offers lower-emission modes", () => {
    const swaps = commuteSwaps(commuteProfile("metro", 12));
    expect(swaps.map((s) => s.to)).toEqual(["work_from_home", "bus"]);
  });

  it("does not offer walking or cycling on a long trip", () => {
    const modes = commuteSwaps(commuteProfile("car_petrol", 12)).map((s) => s.to);
    expect(modes).not.toContain("walk");
    expect(modes).not.toContain("bicycle");
    expect(modes).toEqual(expect.arrayContaining(["metro", "bus", "car_cng", "work_from_home"]));
  });

  it("offers bicycle but not walking for a 5 km trip", () => {
    const modes = commuteSwaps(commuteProfile("car_petrol", 5)).map((s) => s.to);
    expect(modes).toContain("bicycle");
    expect(modes).not.toContain("walk");
  });

  it("offers walking and bicycle for a 2 km trip", () => {
    const modes = commuteSwaps(commuteProfile("car_petrol", 2)).map((s) => s.to);
    expect(modes).toEqual(expect.arrayContaining(["walk", "bicycle"]));
  });

  it("sorts by weekly CO2 saved, biggest first", () => {
    const swaps = commuteSwaps(commuteProfile("car_diesel", 12));
    const saved = swaps.map((s) => s.co2KgSavedPerWeek);
    expect(saved).toEqual([...saved].sort((a, b) => b - a));
    expect(swaps[0].to).toBe("work_from_home");
  });

  it("works out CO2 saved from the emission factors", () => {
    // 120 km/week, petrol 0.14 -> metro 0.02: 0.12 * 120 = 14.4 kg/week, 46 weeks a year.
    const metro = commuteSwaps(commuteProfile("car_petrol", 12)).find((s) => s.to === "metro")!;
    expect(metro.co2KgSavedPerWeek).toBe(14.4);
    expect(metro.co2KgSavedPerYear).toBe(Math.round(14.4 * 46));
    // PM2.5: (0.004 - 0) * 120 = 0.48 g/week.
    expect(metro.pm25GramsSavedPerWeek).toBe(0.48);
  });

  it("never reports negative tailpipe PM2.5 savings", () => {
    // Petrol -> CNG etc. can raise or lower soot; the saving is clamped at zero.
    const swaps = commuteSwaps(commuteProfile("auto_rickshaw", 12));
    for (const s of swaps) expect(s.pm25GramsSavedPerWeek).toBeGreaterThanOrEqual(0);
  });
});

describe("indoorEstimate", () => {
  it("applies the infiltration and purifier factors", () => {
    expect(indoorEstimate(100)).toEqual({
      outdoorPm25: 100,
      indoorPm25: 70,
      indoorWithPurifier: 28,
      purifierCutPercent: 60,
    });
  });

  it("rounds to one decimal", () => {
    expect(indoorEstimate(62).indoorPm25).toBe(43.4);
  });
});

describe("exerciseShift", () => {
  it("computes inhaled dose as concentration x 1.6 m3/h x hours", () => {
    const shift = exerciseShift(60, 100, 50);
    expect(shift.doseAtWorst).toBe(160);
    expect(shift.doseAtBest).toBe(80);
    expect(shift.cutPercent).toBe(50);
    // 50 * 0.7 * 0.4 * 1.6 = 22.4
    expect(shift.indoorDose).toBe(22);
  });

  it("scales with minutes", () => {
    expect(exerciseShift(30, 100, 50).doseAtWorst).toBe(80);
  });

  it("reports a zero cut when the worst window has no PM2.5", () => {
    expect(exerciseShift(45, 0, 0).cutPercent).toBe(0);
  });

  it("reports a zero cut when both windows are equal", () => {
    expect(exerciseShift(45, 60, 60).cutPercent).toBe(0);
  });
});

describe("maskEffect", () => {
  it("cuts the dose by 80%", () => {
    expect(maskEffect(100)).toEqual({ doseNoMask: 100, doseWithN95: 20 });
  });
});
