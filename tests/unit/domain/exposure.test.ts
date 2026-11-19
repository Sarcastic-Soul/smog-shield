import { describe, expect, it } from "vitest";
import {
  cutPercent,
  exerciseShift,
  HEATING_HAZARD,
  indoorEstimate,
  maskEffect,
  simulatedExerciseDose,
} from "@/lib/domain/exposure";

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

describe("indoorEstimate with a smoker", () => {
  it("adds 40 µg/m³ before the purifier cuts it", () => {
    const clean = indoorEstimate(100);
    const smoky = indoorEstimate(100, true);
    expect(clean.indoorPm25).toBe(70);
    expect(smoky.indoorPm25).toBe(110);
    expect(smoky.indoorWithPurifier).toBe(44);
  });
});

describe("HEATING_HAZARD", () => {
  it("flags coal or wood as carbon monoxide and gas heaters as nitrogen dioxide", () => {
    expect(HEATING_HAZARD.coal_or_wood).toBe("carbon_monoxide");
    expect(HEATING_HAZARD.gas_heater).toBe("nitrogen_dioxide");
    expect(HEATING_HAZARD.electric_heater).toBe("none");
  });
});

describe("cutPercent", () => {
  it("is the rounded drop, never negative", () => {
    expect(cutPercent(100, 25)).toBe(75);
    expect(cutPercent(100, 150)).toBe(0);
    expect(cutPercent(0, 5)).toBe(0);
  });
});

describe("simulatedExerciseDose", () => {
  const shift = exerciseShift(60, 100, 40);
  it("picks the dose for each choice", () => {
    expect(simulatedExerciseDose(shift, "worst")).toBe(shift.doseAtWorst);
    expect(simulatedExerciseDose(shift, "best")).toBe(shift.doseAtBest);
    expect(simulatedExerciseDose(shift, "indoors")).toBe(shift.indoorDose);
  });
});
