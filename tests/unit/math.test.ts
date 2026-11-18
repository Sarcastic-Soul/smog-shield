import { describe, expect, it } from "vitest";
import { mean, roundTo } from "@/lib/math";

describe("roundTo", () => {
  it("rounds to one decimal by default", () => {
    expect(roundTo(1.26)).toBe(1.3);
    expect(roundTo(1.24)).toBe(1.2);
  });

  it("rounds to the given number of decimals", () => {
    expect(roundTo(3.14159, 2)).toBe(3.14);
    expect(roundTo(3.14159, 0)).toBe(3);
    expect(roundTo(1234.5678, 3)).toBe(1234.568);
  });

  it("keeps negative numbers and zero", () => {
    expect(roundTo(-2.26)).toBe(-2.3);
    expect(roundTo(0)).toBe(0);
  });
});

describe("mean", () => {
  it("averages the values", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(mean([7])).toBe(7);
  });

  it("returns 0 for an empty list instead of NaN", () => {
    expect(mean([])).toBe(0);
  });
});
