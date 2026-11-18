import { describe, expect, it } from "vitest";
import type { DailyOutlook } from "@/lib/air/types";
import { buildInsights } from "@/lib/domain/insights";
import type { AirReport } from "@/lib/air/types";
import { delhiReport } from "../../fixtures/delhi";
import { healthyProfile, makeProfile } from "../../fixtures/profiles";

const day = (date: string, avgPm25: number): DailyOutlook => ({ date, avgPm25, aqi: 100 });

function withOutlook(avgs: number[], nowPm25 = 100): AirReport {
  const report = delhiReport();
  return {
    ...report,
    now: { ...report.now, pm25: nowPm25 },
    outlook: avgs.map((avg, i) => day(`2026-01-${16 + i}`, avg)),
  };
}

describe("buildInsights", () => {
  it("reports the band with its colour variable", () => {
    const insights = buildInsights(makeProfile(), delhiReport());
    expect(insights.band).toEqual({
      id: "sensitive",
      label: "Unhealthy for sensitive groups",
      colorVar: "--aqi-sensitive",
    });
  });

  it("copies the outlook days from the report", () => {
    const report = delhiReport();
    expect(buildInsights(makeProfile(), report).outlook.days).toEqual(report.outlook);
  });

  describe("outlook trend", () => {
    it("is worsening when the last day is more than 15% higher than now", () => {
      expect(buildInsights(makeProfile(), withOutlook([105, 110, 116])).outlook.trend).toBe("worsening");
    });

    it("is improving when the last day is more than 15% lower than now", () => {
      expect(buildInsights(makeProfile(), withOutlook([90, 80, 84])).outlook.trend).toBe("improving");
    });

    it("is steady inside the 15% band, including exactly 15%", () => {
      expect(buildInsights(makeProfile(), withOutlook([100, 105, 110])).outlook.trend).toBe("steady");
      expect(buildInsights(makeProfile(), withOutlook([115])).outlook.trend).toBe("steady");
      expect(buildInsights(makeProfile(), withOutlook([85])).outlook.trend).toBe("steady");
    });

    it("is steady with no outlook days", () => {
      expect(buildInsights(makeProfile(), withOutlook([])).outlook.trend).toBe("steady");
    });

    it("is steady when the air now has no PM2.5", () => {
      expect(buildInsights(makeProfile(), withOutlook([50], 0)).outlook.trend).toBe("steady");
    });
  });

  describe("community", () => {
    it("scales the best swap to a building of 40 homes", () => {
      const insights = buildInsights(makeProfile(), delhiReport());
      expect(insights.community).toMatchObject({ households: 40 });
      expect(insights.community?.co2TonnesPerYear).toBe(
        Math.round(((insights.commute.swaps[0].co2KgSavedPerYear * 40) / 1000) * 10) / 10,
      );
    });

    it("is null when there are no swaps", () => {
      const profile = makeProfile({ commute: { mode: "bicycle", distanceKm: 3, daysPerWeek: 5 } });
      const insights = buildInsights(profile, delhiReport());
      expect(insights.commute.swaps).toEqual([]);
      expect(insights.community).toBeNull();
    });
  });

  describe("safety alerts", () => {
    const home = makeProfile().home;

    it("warns about smoking indoors only when sensitive members live there", () => {
      const smoker = { ...home, smokerAtHome: true };
      const sensitive = buildInsights(makeProfile({ home: smoker }), delhiReport());
      expect(sensitive.safetyAlerts.join(" ")).toMatch(/Smoking indoors adds about 40/);

      const healthy = buildInsights(healthyProfile({ home: smoker }), delhiReport());
      expect(healthy.safetyAlerts.join(" ")).not.toMatch(/Smoking indoors/);
    });

    it("adds the smoker's extra PM2.5 to the indoor estimate", () => {
      const clean = buildInsights(makeProfile(), delhiReport()).indoor.indoorPm25;
      const smoky = buildInsights(makeProfile({ home: { ...home, smokerAtHome: true } }), delhiReport()).indoor
        .indoorPm25;
      expect(smoky - clean).toBeCloseTo(40, 1);
    });

    it("adds a symptom warning at severe risk for sensitive homes", () => {
      const report = delhiReport();
      const severe = { ...report, now: { ...report.now, aqi: 260 } };
      const alerts = buildInsights(makeProfile(), severe).safetyAlerts;
      expect(alerts.join(" ")).toMatch(/breathlessness/);
      expect(buildInsights(healthyProfile(), severe).safetyAlerts.join(" ")).not.toMatch(/breathlessness/);
    });

    it("lists no alerts for an ordinary home", () => {
      expect(buildInsights(makeProfile(), delhiReport()).safetyAlerts).toEqual([]);
    });
  });

  it("has no exercise comparison when the family does not exercise outdoors", () => {
    const base = makeProfile();
    const insights = buildInsights({ ...base, home: { ...base.home, outdoorExerciseMinutes: 0 } }, delhiReport());
    expect(insights.exercise).toBeNull();
  });

  it("flags polluting cooking fuels", () => {
    const base = makeProfile();
    expect(
      buildInsights({ ...base, home: { ...base.home, cooking: "biomass" } }, delhiReport()).cooking.isPolluting,
    ).toBe(true);
    expect(buildInsights(base, delhiReport()).cooking.isPolluting).toBe(false);
  });
});
