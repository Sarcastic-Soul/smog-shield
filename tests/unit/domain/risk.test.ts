import { describe, expect, it } from "vitest";
import { assessRisk, sensitiveGroupsOf } from "@/lib/domain/risk";
import { healthyProfile, makeProfile } from "../../fixtures/profiles";

describe("assessRisk", () => {
  it("is low for a healthy household when air is good or moderate", () => {
    expect(assessRisk(40, healthyProfile()).level).toBe("low");
    expect(assessRisk(90, healthyProfile()).level).toBe("low");
  });

  it("bumps the level one step when the home has sensitive members", () => {
    expect(assessRisk(120, healthyProfile()).level).toBe("moderate");
    expect(assessRisk(120, makeProfile()).level).toBe("high");
    expect(assessRisk(90, makeProfile()).level).toBe("moderate");
  });

  it("does not bump when air is good", () => {
    expect(assessRisk(30, makeProfile()).level).toBe("low");
  });

  it("caps at severe", () => {
    expect(assessRisk(400, makeProfile()).level).toBe("severe");
    expect(assessRisk(250, makeProfile()).level).toBe("severe");
  });

  it("advises a mask only at high or severe risk", () => {
    expect(assessRisk(120, healthyProfile()).maskAdvised).toBe(false);
    expect(assessRisk(170, healthyProfile()).maskAdvised).toBe(true);
    expect(assessRisk(120, makeProfile()).maskAdvised).toBe(true);
  });

  it("mentions N95 in the outdoor rule when risk is high", () => {
    expect(assessRisk(170, healthyProfile()).outdoorRule).toMatch(/N95/);
  });

  it("gives a different moderate rule depending on sensitive members", () => {
    const withSensitive = assessRisk(90, makeProfile()).outdoorRule;
    const without = assessRisk(120, healthyProfile()).outdoorRule;
    expect(withSensitive).toMatch(/sensitive members/);
    expect(without).not.toMatch(/sensitive members/);
  });
});

describe("sensitiveGroupsOf", () => {
  it("lists children, older adults and each condition", () => {
    const groups = sensitiveGroupsOf(makeProfile());
    expect(groups).toEqual([
      { id: "children", label: "children" },
      { id: "seniors", label: "older adults" },
      { id: "asthma", label: "someone with asthma" },
    ]);
  });

  it("is empty for a healthy adult household", () => {
    expect(sensitiveGroupsOf(healthyProfile())).toEqual([]);
    expect(assessRisk(120, healthyProfile()).hasSensitiveMembers).toBe(false);
  });
});
