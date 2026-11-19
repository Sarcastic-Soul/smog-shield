import { describe, expect, it } from "vitest";
import { buildInsights } from "@/lib/domain/insights";
import { PLAN_LIMITS } from "@/lib/domain/plan";
import { buildIndoorHacks } from "@/lib/domain/rules/indoor";
import { delhiReport } from "../../../fixtures/delhi";
import { makeProfile } from "../../../fixtures/profiles";

const hacksFor = (profile = makeProfile()) => {
  const report = delhiReport();
  return buildIndoorHacks(profile, report, buildInsights(profile, report));
};

describe("buildIndoorHacks", () => {
  it("runs the purifier when the home has one", () => {
    const home = { ...makeProfile().home, hasPurifier: true };
    expect(hacksFor(makeProfile({ home }))[0].title).toBe("Run your purifier in one closed room");
  });

  it("suggests a box-fan filter for a low budget without a purifier", () => {
    const home = { ...makeProfile().home, hasPurifier: false };
    expect(hacksFor(makeProfile({ home, budget: "low" }))[0].title).toBe("Build a box-fan filter");
  });

  it("suggests a clean room for a higher budget without a purifier", () => {
    const home = { ...makeProfile().home, hasPurifier: false };
    expect(hacksFor(makeProfile({ home, budget: "high" }))[0].title).toBe("Make one clean room");
  });

  it("always warns about indoor smoke sources", () => {
    expect(hacksFor().map((h) => h.title)).toContain("Stop indoor smoke sources");
  });

  it("stays within the plan limit", () => {
    const home = {
      ...makeProfile().home,
      smokerAtHome: true,
      cooking: "biomass" as const,
      heating: "coal_or_wood" as const,
    };
    expect(hacksFor(makeProfile({ home })).length).toBeLessThanOrEqual(PLAN_LIMITS.indoorHacksMax);
  });
});
