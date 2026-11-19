import { describe, expect, it } from "vitest";
import { buildGroupAdvice } from "@/lib/domain/rules/groups";
import type { HouseholdRisk } from "@/lib/domain/risk";

const risk = (maskAdvised: boolean, ids: HouseholdRisk["sensitiveGroups"][number]["id"][]): HouseholdRisk =>
  ({ maskAdvised, sensitiveGroups: ids.map((id) => ({ id, label: `Label ${id}` })) }) as unknown as HouseholdRisk;

describe("buildGroupAdvice", () => {
  it("gives one entry per sensitive group, using the group label", () => {
    const advice = buildGroupAdvice(risk(false, ["children", "asthma"]));
    expect(advice.map((a) => a.group)).toEqual(["Label children", "Label asthma"]);
  });

  it("adds no mask line when no mask is advised", () => {
    expect(buildGroupAdvice(risk(false, ["seniors"]))[0].advice).not.toContain("N95");
  });

  it("adds a child-size N95 for children and a snug N95 for others", () => {
    const [kids, seniors] = buildGroupAdvice(risk(true, ["children", "seniors"]));
    expect(kids.advice).toContain("child-size N95");
    expect(seniors.advice).toContain("snug N95");
  });

  it("returns nothing for a household without sensitive groups", () => {
    expect(buildGroupAdvice(risk(true, []))).toEqual([]);
  });
});
