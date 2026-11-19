import { describe, expect, it } from "vitest";
import {
  BUILDING_SCALE,
  COMMUNITY_SCALE_IDS,
  COMMUNITY_SCALES,
  communityScaleLabel,
  commuteSwaps,
  communityImpact,
  TREE_KG_CO2_PER_YEAR,
  treesEquivalent,
  weeklyCommuteKm,
} from "@/lib/domain/emissions";
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
    expect(swaps.map((s) => s.to)).toEqual(["bus", "work_from_home"]);
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
    const shared = swaps.filter((s) => s.to !== "work_from_home").map((s) => s.co2KgSavedPerWeek);
    expect(shared).toEqual([...shared].sort((a, b) => b - a));
    expect(swaps[0].to).not.toBe("work_from_home");
    expect(swaps.at(-1)?.to).toBe("work_from_home");
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

describe("communityImpact", () => {
  const swap = { to: "metro" as const, co2KgSavedPerWeek: 10, pm25GramsSavedPerWeek: 0.5, co2KgSavedPerYear: 460 };

  it("scales one household's yearly saving to many households", () => {
    expect(communityImpact(swap, 40)).toEqual({
      households: 40,
      co2TonnesPerYear: 18.4,
      pm25KgPerYear: 0.92,
      trees: treesEquivalent(460 * 40),
    });
    expect(communityImpact(swap, 1000).co2TonnesPerYear).toBe(460);
  });

  it("matches the single-home figure for one home", () => {
    expect(communityImpact(swap, 1).co2TonnesPerYear).toBe(0.5);
  });
});

describe("COMMUNITY_SCALES", () => {
  it("offers a home, a building of 40 and a ward of 1,000", () => {
    expect(COMMUNITY_SCALE_IDS.map((id) => COMMUNITY_SCALES[id].households)).toEqual([1, 40, 1000]);
  });

  it("uses the building scale for the plan's community numbers", () => {
    expect(BUILDING_SCALE).toBe(COMMUNITY_SCALES.building);
  });

  it("labels each scale with its size", () => {
    expect(communityScaleLabel("home")).toBe(COMMUNITY_SCALES.home.name);
    expect(communityScaleLabel("building")).toBe(`${COMMUNITY_SCALES.building.name} (40 homes)`);
    expect(communityScaleLabel("ward")).toBe(`${COMMUNITY_SCALES.ward.name} (1,000 homes)`);
  });
});

describe("treesEquivalent", () => {
  it("rounds to whole trees, at least 1 for any saving, 0 for none", () => {
    expect(TREE_KG_CO2_PER_YEAR).toBe(21);
    expect(treesEquivalent(210)).toBe(10);
    expect(treesEquivalent(5)).toBe(1);
    expect(treesEquivalent(0)).toBe(0);
    expect(treesEquivalent(-4)).toBe(0);
  });
});

describe("BUILDING_SCALE", () => {
  it("is the 40-home building", () => {
    expect(BUILDING_SCALE.households).toBe(40);
  });
});
