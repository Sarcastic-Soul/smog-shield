import { describe, expect, it } from "vitest";
import { pm25ToAqi } from "@/lib/air/aqi";
import type { HourlyAir } from "@/lib/air/types";
import { clockLabel, dayOf, DAY_END_HOUR, DAY_START_HOUR, findWindows } from "@/lib/domain/windows";
import { hourlyPoints } from "../../fixtures/delhi";

const hour = (date: string, h: number, pm25: number): HourlyAir => ({
  time: `${date}T${String(h).padStart(2, "0")}:00`,
  pm25,
  aqi: pm25 * 2,
});

describe("findWindows", () => {
  it("returns null for an empty forecast", () => {
    expect(findWindows([])).toBeNull();
  });

  it("returns null when fewer hours than the window size exist", () => {
    expect(findWindows([hour("2026-01-15", 10, 50)])).toBeNull();
  });

  it("picks the lowest and highest PM2.5 windows", () => {
    const hours = [10, 11, 12, 13, 14, 15].map((h, i) => hour("2026-01-15", h, [80, 60, 30, 35, 90, 100][i]));
    const result = findWindows(hours)!;
    expect(result.best.start).toBe("2026-01-15T12:00");
    expect(result.best.end).toBe("2026-01-15T14:00");
    expect(result.best.avgPm25).toBe(32.5);
    expect(result.worst.start).toBe("2026-01-15T14:00");
    expect(result.worst.avgPm25).toBe(95);
  });

  it("ranks by PM2.5, not AQI", () => {
    const hours = [
      { time: "2026-01-15T10:00", pm25: 20, aqi: 300 },
      { time: "2026-01-15T11:00", pm25: 20, aqi: 300 },
      { time: "2026-01-15T12:00", pm25: 90, aqi: 10 },
      { time: "2026-01-15T13:00", pm25: 90, aqi: 10 },
    ];
    const result = findWindows(hours)!;
    expect(result.best.start).toBe("2026-01-15T10:00");
    expect(result.worst.start).toBe("2026-01-15T12:00");
  });

  it("ignores night hours even when they are the cleanest", () => {
    const hours = [2, 3, 4, 10, 11].map((h, i) => hour("2026-01-15", h, [5, 5, 5, 70, 80][i]));
    const result = findWindows(hours)!;
    expect(result.best.start).toBe("2026-01-15T10:00");
  });

  it("excludes the 21:00 hour (daytime ends at 21:00)", () => {
    const hours = [19, 20, 21, 22].map((h, i) => hour("2026-01-15", h, [100, 100, 10, 10][i]));
    const result = findWindows(hours)!;
    expect(result.best.start).toBe("2026-01-15T19:00");
    expect(result.worst.start).toBe("2026-01-15T19:00");
  });

  it("never builds a window across two days", () => {
    const hours = [
      hour("2026-01-15", 23, 1),
      hour("2026-01-16", 6, 1),
      hour("2026-01-16", 7, 50),
      hour("2026-01-16", 8, 60),
    ];
    const result = findWindows(hours)!;
    expect(result.best.start).toBe("2026-01-16T06:00");
  });

  it("returns null when every hour is at night", () => {
    const hours = [0, 1, 2, 3].map((h) => hour("2026-01-15", h, 50));
    expect(findWindows(hours)).toBeNull();
  });

  it("respects a custom window size", () => {
    const hours = [8, 9, 10, 11].map((h, i) => hour("2026-01-15", h, [10, 20, 30, 40][i]));
    const result = findWindows(hours, 3)!;
    expect(result.best.start).toBe("2026-01-15T08:00");
    expect(result.best.end).toBe("2026-01-15T11:00");
    expect(result.worst.start).toBe("2026-01-15T09:00");
  });

  it("finds the afternoon trough and evening peak in the Delhi fixture", () => {
    const hours = hourlyPoints().slice(10, 34);
    const result = findWindows(hours)!;
    expect(result.best.start).toBe("2026-01-15T12:00");
    expect(result.worst.start).toBe("2026-01-15T19:00");
  });
});

describe("clockLabel", () => {
  it("returns HH:mm from a local time", () => {
    expect(clockLabel("2026-01-15T07:00")).toBe("07:00");
  });
});

describe("dayOf", () => {
  it("says today for the same date and tomorrow for a later date", () => {
    expect(dayOf("2026-01-15T19:00", "2026-01-15T10:00")).toBe("today");
    expect(dayOf("2026-01-16T07:00", "2026-01-15T10:00")).toBe("tomorrow");
  });

  it("treats earlier dates as today", () => {
    expect(dayOf("2026-01-14T07:00", "2026-01-15T10:00")).toBe("today");
  });
});

describe("daytime hours", () => {
  it("run from 06:00 to 21:00", () => {
    expect(DAY_START_HOUR).toBe(6);
    expect(DAY_END_HOUR).toBe(21);
  });
});

describe("findWindows across days", () => {
  it("can pick a window tomorrow when that is the cleanest", () => {
    const hours = [
      ...[18, 19, 20].map((h) => hour("2026-01-15", h, 100)),
      ...[7, 8, 9].map((h) => hour("2026-01-16", h, 10)),
    ];
    const result = findWindows(hours)!;
    expect(result.best.start).toBe("2026-01-16T07:00");
    expect(result.best.end).toBe("2026-01-16T09:00");
  });

  it("reports AQI from the window's average PM2.5", () => {
    const hours = [10, 11].map((h) => hour("2026-01-15", h, 40));
    expect(findWindows(hours)!.best.avgAqi).toBe(pm25ToAqi(40));
  });

  it("handles a long forecast in one pass", () => {
    const hours = Array.from({ length: 96 }, (_, i) =>
      hour(`2026-01-${15 + Math.floor(i / 24)}`, i % 24, 50 + (i % 24)),
    );
    const result = findWindows(hours)!;
    expect(result.best.start).toBe("2026-01-15T06:00");
    expect(result.worst.start).toBe("2026-01-15T19:00");
  });
});
