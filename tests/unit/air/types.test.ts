import { describe, expect, it } from "vitest";
import { clockOf, dateOf, hourOf, minutesOfClock, POLLUTANT_LABELS } from "@/lib/air/types";

describe("local time helpers", () => {
  it("splits a local time string", () => {
    expect(hourOf("2026-01-15T09:30")).toBe(9);
    expect(dateOf("2026-01-15T09:30")).toBe("2026-01-15");
    expect(clockOf("2026-01-15T09:30")).toBe("09:30");
  });

  it("converts a clock to minutes since midnight", () => {
    expect(minutesOfClock("00:00")).toBe(0);
    expect(minutesOfClock("17:30")).toBe(1050);
    expect(minutesOfClock("23:59")).toBe(1439);
  });

  it("labels every pollutant", () => {
    expect(Object.keys(POLLUTANT_LABELS).sort()).toEqual(["co", "no2", "ozone", "pm10", "pm25", "so2"]);
    expect(POLLUTANT_LABELS.pm25).toBe("PM2.5");
  });
});
