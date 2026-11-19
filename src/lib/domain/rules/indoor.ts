import type { AirReport } from "../../air/types";
import { CLEAN_COOKING_PM25, SMOKER_INDOOR_PM25 } from "../exposure";
import type { Insights } from "../insights";
import { PLAN_LIMITS, type Plan } from "../plan";
import type { Profile } from "../profile-options";

/* Indoor air fixes of the rule-based plan. */

export function buildIndoorHacks(profile: Profile, report: AirReport, insights: Insights): Plan["indoorHacks"] {
  const { indoor, cooking } = insights;
  const hacks: Plan["indoorHacks"] = [
    profile.home.hasPurifier
      ? {
          title: "Run your purifier in one closed room",
          action: "Keep it on high in the bedroom with the door shut. Change the HEPA filter when it greys.",
          impact: `Indoor PM2.5 drops about ${indoor.purifierCutPercent}%: from ~${indoor.indoorPm25} to ~${indoor.indoorWithPurifier} µg/m³.`,
        }
      : {
          title: profile.budget === "low" ? "Build a box-fan filter" : "Make one clean room",
          action:
            profile.budget === "low"
              ? "Strap a MERV-13 furnace filter to a box fan and run it in the bedroom with the door shut."
              : "Pick the bedroom, seal window gaps with tape, and run a HEPA purifier sized for the room.",
          impact: `Cuts bedroom PM2.5 by about ${indoor.purifierCutPercent}%: from ~${indoor.indoorPm25} to ~${indoor.indoorWithPurifier} µg/m³.`,
        },
    {
      title: "Stop indoor smoke sources",
      action: "Skip incense, mosquito coils, candles and frying with the window closed on high-AQI days.",
      impact: "One incense stick can push room PM2.5 above 100 µg/m³ for an hour.",
    },
    {
      title: "Wet-clean, don't sweep",
      action: "Mop floors and wipe sills with a damp cloth; dry sweeping throws settled dust back into the air.",
      impact: `Cuts re-suspended coarse dust (PM10), which is ${report.now.pm10} µg/m³ outdoors today.`,
    },
  ];

  if (profile.home.smokerAtHome) {
    hacks.unshift({
      title: "Take smoking outside",
      action: "Smoke outdoors, away from doors and windows, and never in the car with children.",
      impact: `Removes about ${SMOKER_INDOOR_PM25} µg/m³ of extra indoor PM2.5 for the whole household.`,
    });
  }
  if (cooking.isPolluting) {
    hacks.unshift({
      title: "Move cooking away from wood or kerosene",
      action: "Switch to LPG or induction for daily meals, or cook near an open window if you cannot.",
      impact: `Cuts kitchen PM2.5 from ~${cooking.addedPm25} µg/m³ to under ${CLEAN_COOKING_PM25} µg/m³ during cooking.`,
    });
  }
  return hacks.slice(0, PLAN_LIMITS.indoorHacksMax);
}
