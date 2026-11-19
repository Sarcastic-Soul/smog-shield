import type { CommuteSwap } from "@/lib/domain/emissions";
import { CLEAN_COOKING_PM25 } from "@/lib/domain/exposure";
import type { Insights } from "@/lib/domain/insights";
import { PLAN_LIMITS, type Plan } from "@/lib/domain/plan";
import { COMMUTE_LABELS, COOKING_LABELS, type Profile } from "@/lib/domain/profile-options";
import { inSentence } from "@/lib/domain/rules/text";

/* Low-emission swaps of the rule-based plan: commute first, then home. */

/** One commute swap written as a plan item, with its measured savings. */
export function commuteSwapItem(profile: Profile, swap: CommuteSwap): Plan["alternatives"][number] {
  return {
    swap: `${COMMUTE_LABELS[profile.commute.mode]} → ${COMMUTE_LABELS[swap.to]}`,
    action:
      swap.to === "work_from_home"
        ? "Ask for remote days on the worst smog days of the week."
        : `Take the ${inSentence(COMMUTE_LABELS[swap.to])} for your ${profile.commute.distanceKm} km trip.`,
    impact: `Saves ${swap.co2KgSavedPerWeek} kg CO₂ a week (${swap.co2KgSavedPerYear} kg a year) and ${swap.pm25GramsSavedPerWeek} g of tailpipe PM2.5.`,
  };
}

export function buildAlternatives(profile: Profile, insights: Insights): Plan["alternatives"] {
  const swaps = insights.commute.swaps
    .slice(0, PLAN_LIMITS.commuteSwapsShown)
    .map((swap) => commuteSwapItem(profile, swap));

  if (insights.heatingHazard !== "none") {
    swaps.push({
      swap: "Fire or gas heater → electric heater or heat pump",
      action: "Heat one closed room with an oil-filled radiator or inverter AC instead of burning fuel indoors.",
      impact: "Removes the indoor carbon monoxide and NO₂ source and the soot it adds to your room.",
    });
  }
  if (profile.home.wasteBurningNearby) {
    swaps.push({
      swap: "Burning leaves or waste → composting",
      action: "Bag dry leaves and kitchen waste for compost and ask neighbours to do the same.",
      impact: `Burning nearby adds to an outdoor PM2.5 of ${insights.indoor.outdoorPm25} µg/m³ today.`,
    });
  }
  if (insights.cooking.isPolluting) {
    swaps.push({
      swap: `${COOKING_LABELS[insights.cooking.fuel]} → LPG or induction`,
      action: "Use LPG or an induction plate for daily cooking.",
      impact: `Cuts kitchen PM2.5 from ~${insights.cooking.addedPm25} µg/m³ to under ${CLEAN_COOKING_PM25} µg/m³ while cooking.`,
    });
  } else if (swaps.length < 3) {
    swaps.push({
      swap: "Open pot → pressure cooker",
      action: "Cook dal, rice and stews in a pressure cooker with the lid on.",
      impact: `Shorter cooking means less of the ~${insights.cooking.addedPm25} µg/m³ cooking adds, and about a third less fuel.`,
    });
  }
  return swaps.slice(0, PLAN_LIMITS.alternativesMax);
}
