import { describe, expect, it } from "vitest";
import { buildFacts, languageName } from "@/lib/ai/facts";
import { buildInsights } from "@/lib/domain/insights";
import { COMMUTE_LABELS } from "@/lib/domain/profile-options";
import { delhiReport } from "../../fixtures/delhi";
import { makeProfile } from "../../fixtures/profiles";

describe("buildFacts", () => {
  const profile = makeProfile();
  const report = delhiReport();
  const insights = buildInsights(profile, report);
  const facts = buildFacts(profile, report, insights);

  it("names the place and the current readings", () => {
    expect(facts).toContain("New Delhi, Delhi, India");
    expect(facts).toContain(`US AQI ${report.now.aqi}`);
    expect(facts).toContain(`PM2.5 ${report.now.pm25}`);
  });

  it("includes WHO multiple, cigarettes and the forecast windows", () => {
    expect(facts).toContain(`${insights.timesWhoLimit}x WHO daily limit`);
    expect(facts).toContain(`${insights.cigarettesPerDay} cigarettes/day`);
    expect(facts).toContain("Cleanest daytime window: today 12:00-14:00");
    expect(facts).toContain("Worst: today 19:00-21:00");
  });

  it("includes household, commute and swap numbers", () => {
    expect(facts).toContain("2 adult(s), 1 child(ren), 1 senior(s)");
    expect(facts).toContain("Asthma");
    expect(facts).toContain(`${insights.commute.weeklyKm} km/week`);
    expect(facts).toContain("saves");
  });

  it("includes safety alerts when present", () => {
    const hazard = makeProfile({ home: { ...profile.home, heating: "coal_or_wood" } });
    const text = buildFacts(hazard, report, buildInsights(hazard, report));
    expect(text).toContain("Safety alerts:");
    expect(text).toContain("carbon monoxide");
  });

  it("says so when there is no regular exercise", () => {
    const lazy = makeProfile({ home: { ...profile.home, outdoorExerciseMinutes: 0 } });
    expect(buildFacts(lazy, report, buildInsights(lazy, report))).toContain("No regular outdoor exercise.");
  });
});

describe("buildFacts pollutants and swaps", () => {
  const profile = makeProfile();
  const report = delhiReport();
  const facts = (r = report) => buildFacts(profile, r, buildInsights(profile, r));

  it("names the main pollutant", () => {
    expect(facts()).toContain("main pollutant PM2.5;");
    const ozone = { ...report, now: { ...report.now, dominant: "ozone" as const } };
    expect(facts(ozone)).toContain("main pollutant ozone;");
  });

  it("numbers the commute swaps", () => {
    const text = facts();
    expect(text).toContain("Swap 1:");
    expect(text).toContain("Swap 2:");
  });
});

describe("buildFacts details", () => {
  const profile = makeProfile();
  const report = delhiReport();
  const factsFor = (p = profile, r = report) => buildFacts(p, r, buildInsights(p, r));

  it("names the language, date and local time", () => {
    const facts = factsFor();
    expect(facts).toContain("Language: English.");
    expect(facts).toContain("Local date 2026-01-15, local time now 10:00.");
    expect(factsFor(makeProfile({ language: "ur" }))).toContain("Language: Urdu.");
  });

  it("states whether an N95 is advised", () => {
    expect(factsFor()).toContain("N95 advised: yes");
    const calm = { ...report, now: { ...report.now, aqi: 60 } };
    expect(factsFor(profile, calm)).toContain("N95 advised: no");
  });

  it("lists the daily outlook and the trend", () => {
    const facts = factsFor();
    expect(facts).toContain("Next days (daily mean PM2.5): 2026-01-16 88.6; 2026-01-17 88.6; 2026-01-18 88.6.");
    expect(facts).toContain("Trend: worsening.");
  });

  it("says so when there is no outlook", () => {
    expect(factsFor(profile, { ...report, outlook: [] })).toContain("No multi-day outlook.");
  });

  it("gives the community numbers for a building of 40 homes", () => {
    const insights = buildInsights(profile, report);
    const label = COMMUTE_LABELS[insights.commute.swaps[0].to];
    expect(factsFor()).toContain(
      `if 40 homes in the building made the ${label} swap, ${insights.community?.co2TonnesPerYear} t CO2/year`,
    );
  });

  it("explains the community focus when the commute is already clean", () => {
    const biker = makeProfile({ commute: { mode: "bicycle", distanceKm: 3, daysPerWeek: 5 } });
    const facts = factsFor(biker);
    expect(facts).toContain("Commute swaps: none, already low emission.");
    expect(facts).toContain("Community: commute already low emission");
  });

  it("includes the smoker and waste burning flags", () => {
    const flagged = makeProfile({ home: { ...profile.home, smokerAtHome: true, wasteBurningNearby: true } });
    const facts = factsFor(flagged);
    expect(facts).toContain("Smoker at home: yes.");
    expect(facts).toContain("Waste or crop burning nearby: yes.");
    expect(facts).toContain("Smoking indoors adds about 40");
  });

  it("lists each sensitive group by label", () => {
    expect(factsFor()).toContain("Sensitive groups: children; older adults; someone with asthma.");
    expect(factsFor(makeProfile({ household: { adults: 2, children: 0, seniors: 0, conditions: [] } }))).toContain(
      "Sensitive groups: none.",
    );
  });

  it("marks a window that falls tomorrow", () => {
    const late = { ...report, now: { ...report.now, time: "2026-01-15T22:00" }, next24h: report.next24h.slice(12) };
    expect(factsFor(profile, late)).toMatch(/Cleanest daytime window: tomorrow/);
  });

  it("says when there is no daytime window", () => {
    const night = {
      ...report,
      next24h: report.next24h.slice(0, 3).map((h, i) => ({ ...h, time: `2026-01-15T0${i}:00` })),
    };
    expect(factsFor(profile, night)).toContain("No daytime forecast window available.");
  });

  it("leaves region out when the place has none", () => {
    const noRegion = { ...report, place: { ...report.place, region: "" } };
    expect(factsFor(profile, noRegion)).toContain("Location: New Delhi, India.");
  });
});

describe("languageName", () => {
  it("returns the English name of the language", () => {
    expect(languageName("hi")).toBe("Hindi");
    expect(languageName("pa")).toBe("Punjabi");
  });
});
