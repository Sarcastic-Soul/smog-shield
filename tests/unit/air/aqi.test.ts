import { describe, expect, it } from "vitest";
import { bandFor, cigarettesPerDay, pm25ToAqi, timesWhoLimit } from "@/lib/air/aqi";

describe("bandFor", () => {
  it.each([
    [0, "good"],
    [50, "good"],
    [51, "moderate"],
    [100, "moderate"],
    [101, "sensitive"],
    [150, "sensitive"],
    [151, "unhealthy"],
    [200, "unhealthy"],
    [201, "very_unhealthy"],
    [300, "very_unhealthy"],
    [301, "hazardous"],
    [999, "hazardous"],
  ])("puts AQI %i in the %s band", (aqi, id) => {
    expect(bandFor(aqi).id).toBe(id);
  });

  it("rounds fractional values before choosing a band", () => {
    expect(bandFor(50.4).id).toBe("good");
    expect(bandFor(50.6).id).toBe("moderate");
  });

  it("treats negative values as good", () => {
    expect(bandFor(-5).id).toBe("good");
  });

  it("exposes a colour variable for each band", () => {
    expect(bandFor(120).colorVar).toBe("--aqi-sensitive");
  });
});

describe("cigarettesPerDay", () => {
  it("is PM2.5 divided by 22, rounded to one decimal", () => {
    expect(cigarettesPerDay(22)).toBe(1);
    expect(cigarettesPerDay(110)).toBe(5);
    expect(cigarettesPerDay(45)).toBe(2);
  });

  it("never goes below zero", () => {
    expect(cigarettesPerDay(-10)).toBe(0);
  });
});

describe("timesWhoLimit", () => {
  it("is PM2.5 divided by the WHO 15 µg/m³ guideline", () => {
    expect(timesWhoLimit(15)).toBe(1);
    expect(timesWhoLimit(90)).toBe(6);
    expect(timesWhoLimit(100)).toBe(6.7);
  });

  it("never goes below zero", () => {
    expect(timesWhoLimit(-1)).toBe(0);
  });
});

describe("pm25ToAqi (EPA 2024 breakpoints)", () => {
  it.each([
    [0, 0],
    [9.0, 50],
    [9.1, 51],
    [35.4, 100],
    [35.5, 101],
    [55.4, 150],
    [55.5, 151],
    [125.4, 200],
    [225.4, 300],
    [325.4, 500],
    [900, 500],
  ])("PM2.5 %s µg/m³ -> AQI %s", (pm25, aqi) => {
    expect(pm25ToAqi(pm25)).toBe(aqi);
  });

  it("never goes negative", () => {
    expect(pm25ToAqi(-5)).toBe(0);
  });
});
