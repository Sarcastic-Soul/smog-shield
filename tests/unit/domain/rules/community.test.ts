import { describe, expect, it } from "vitest";
import { buildInsights } from "@/lib/domain/insights";
import { buildCommunityActions } from "@/lib/domain/rules/community";
import { delhiReport } from "../../../fixtures/delhi";
import { makeProfile } from "../../../fixtures/profiles";

const actionsFor = (profile = makeProfile()) => buildCommunityActions(profile, buildInsights(profile, delhiReport()));

describe("buildCommunityActions", () => {
  it("starts a shared trip with neighbours when a real swap exists", () => {
    expect(actionsFor()[0]).toMatchObject({ who: "Your building or lane" });
    expect(actionsFor()[0].action).toContain("shared");
  });

  it("asks the school to act only when there are children", () => {
    expect(actionsFor().map((a) => a.who)).toContain("Your child's school");
    const adults = makeProfile({ household: { adults: 2, children: 0, seniors: 0, conditions: [] } });
    expect(actionsFor(adults).map((a) => a.who)).not.toContain("Your child's school");
  });

  it("reports burning to the RWA when waste is burned nearby", () => {
    const profile = makeProfile({ home: { ...makeProfile().home, wasteBurningNearby: true } });
    expect(actionsFor(profile).at(-1)?.action).toContain("Report the burning");
  });

  it("otherwise suggests a purifier room for older neighbours", () => {
    expect(actionsFor().at(-1)?.action).toContain("purifier-equipped room");
  });

  it("skips the carpool item when the commute is already clean", () => {
    const biker = makeProfile({ commute: { mode: "bicycle", distanceKm: 3, daysPerWeek: 5 } });
    expect(actionsFor(biker).map((a) => a.who)).not.toContain("Your building or lane");
  });
});
