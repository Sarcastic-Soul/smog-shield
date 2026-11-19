import { BUILDING_SCALE } from "../emissions";
import type { Insights } from "../insights";
import { PLAN_LIMITS, type Plan } from "../plan";
import { COMMUTE_LABELS, type Profile } from "../profile-options";
import { inSentence } from "./text";

/* Actions with neighbours, the school and the RWA. */

/** AQI above which we suggest schools keep PE and assembly indoors ("Very unhealthy" starts at 201). */
const SCHOOL_INDOOR_AQI = 200;

export function buildCommunityActions(profile: Profile, insights: Insights): Plan["communityActions"] {
  const actions: Plan["communityActions"] = [];

  const shared = insights.commute.swaps.find((swap) => swap.to !== "work_from_home");
  if (insights.community && shared) {
    actions.push({
      who: "Your building or lane",
      action: `Start a carpool or shared ${inSentence(COMMUTE_LABELS[shared.to])} trip with neighbours on smog days.`,
      impact: `If ${BUILDING_SCALE.households} homes make this swap, that is ${insights.community.co2TonnesPerYear} t of CO₂ a year saved.`,
    });
  }
  if (profile.household.children > 0) {
    actions.push({
      who: "Your child's school",
      action: `Ask the school to move outdoor PE and assembly indoors when AQI is above ${SCHOOL_INDOOR_AQI}.`,
      impact: `Today's worst window reaches PM2.5 ${insights.windows?.worst.avgPm25 ?? "high"} µg/m³; children breathe more air per kg than adults.`,
    });
  }
  actions.push(
    profile.home.wasteBurningNearby
      ? {
          who: "Your resident welfare association",
          action: "Report the burning near you to the municipal helpline and ask the RWA to arrange compost pick-up.",
          impact: `Local burning adds to today's PM2.5 of ${insights.indoor.outdoorPm25} µg/m³, ${insights.timesWhoLimit}× the WHO limit.`,
        }
      : {
          who: "Your resident welfare association",
          action: "Set up one purifier-equipped room older neighbours can use on the worst days.",
          impact: `A filtered room keeps PM2.5 near ~${insights.indoor.indoorWithPurifier} µg/m³ while outdoors is ${insights.indoor.outdoorPm25}.`,
        },
  );
  return actions.slice(0, PLAN_LIMITS.communityActionsMax);
}
