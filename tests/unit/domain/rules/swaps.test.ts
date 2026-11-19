import { describe, expect, it } from "vitest";
import { buildInsights } from "@/lib/domain/insights";
import { buildAlternatives, commuteSwapItem } from "@/lib/domain/rules/swaps";
import { delhiReport } from "../../../fixtures/delhi";
import { makeProfile } from "../../../fixtures/profiles";

const insightsFor = (profile = makeProfile()) => buildInsights(profile, delhiReport());

describe("commuteSwapItem", () => {
  const profile = makeProfile();
  const swap = insightsFor(profile).commute.swaps[0];

  it("names the current and the new mode", () => {
    expect(commuteSwapItem(profile, { ...swap, to: "bus" }).swap).toBe("Petrol car → Bus");
  });

  it("states the measured savings", () => {
    const item = commuteSwapItem(profile, swap);
    expect(item.impact).toContain(`${swap.co2KgSavedPerWeek} kg CO₂ a week`);
    expect(item.impact).toContain(`${swap.co2KgSavedPerYear} kg a year`);
  });

  it("mentions the trip length for a real mode", () => {
    expect(commuteSwapItem(profile, { ...swap, to: "metro" }).action).toContain(`${profile.commute.distanceKm} km`);
  });

  it("asks for remote days when the swap is working from home", () => {
    expect(commuteSwapItem(profile, { ...swap, to: "work_from_home" }).action).toContain("remote days");
  });
});

describe("buildAlternatives", () => {
  it("starts with up to three commute swaps", () => {
    const profile = makeProfile();
    const swaps = buildAlternatives(profile, insightsFor(profile));
    expect(swaps[0].swap).toContain("Petrol car →");
    expect(swaps.length).toBeLessThanOrEqual(5);
  });

  it("adds a heater swap when heating is a hazard", () => {
    const profile = makeProfile({ home: { ...makeProfile().home, heating: "coal_or_wood" } });
    expect(buildAlternatives(profile, insightsFor(profile)).map((s) => s.swap)).toContain(
      "Fire or gas heater → electric heater or heat pump",
    );
  });

  it("adds a composting swap when waste is burned nearby", () => {
    const profile = makeProfile({ home: { ...makeProfile().home, wasteBurningNearby: true } });
    expect(buildAlternatives(profile, insightsFor(profile)).map((s) => s.swap)).toContain(
      "Burning leaves or waste → composting",
    );
  });

  it("adds an LPG swap for polluting cooking fuel", () => {
    const profile = makeProfile({ home: { ...makeProfile().home, cooking: "biomass" } });
    expect(buildAlternatives(profile, insightsFor(profile)).some((s) => s.swap.endsWith("→ LPG or induction"))).toBe(
      true,
    );
  });

  it("falls back to a pressure cooker when few swaps exist", () => {
    const profile = makeProfile({ commute: { mode: "bicycle", distanceKm: 3, daysPerWeek: 5 } });
    expect(buildAlternatives(profile, insightsFor(profile)).map((s) => s.swap)).toContain("Open pot → pressure cooker");
  });
});
