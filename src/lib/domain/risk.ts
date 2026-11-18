import { bandFor, type AqiBandId } from "../air/aqi";
import { CONDITION_LABELS, type Profile } from "./profile";

export type RiskLevel = "low" | "moderate" | "high" | "severe";

export interface HouseholdRisk {
  level: RiskLevel;
  /** True when anyone in the home is a child, senior or has a listed condition. */
  hasSensitiveMembers: boolean;
  sensitiveGroups: string[];
  /** Plain-language rule for going outside right now. */
  outdoorRule: string;
  /** Whether an N95/FFP2 mask is advised for anyone going out. */
  maskAdvised: boolean;
}

const LEVEL_ORDER: RiskLevel[] = ["low", "moderate", "high", "severe"];

const BASE_LEVEL: Record<AqiBandId, RiskLevel> = {
  good: "low",
  moderate: "low",
  sensitive: "moderate",
  unhealthy: "high",
  very_unhealthy: "severe",
  hazardous: "severe",
};

function bump(level: RiskLevel): RiskLevel {
  return LEVEL_ORDER[Math.min(LEVEL_ORDER.indexOf(level) + 1, LEVEL_ORDER.length - 1)];
}

export function sensitiveGroupsOf(profile: Profile): string[] {
  const groups: string[] = [];
  if (profile.household.children > 0) groups.push("children");
  if (profile.household.seniors > 0) groups.push("older adults");
  for (const condition of profile.household.conditions) {
    groups.push(`someone with ${CONDITION_LABELS[condition].toLowerCase()}`);
  }
  return groups;
}

/**
 * Risk for this household at a given AQI. Sensitive members push the level up
 * one step, because the EPA scale already warns them a band earlier.
 */
export function assessRisk(aqi: number, profile: Profile): HouseholdRisk {
  const band = bandFor(aqi);
  const sensitiveGroups = sensitiveGroupsOf(profile);
  const hasSensitiveMembers = sensitiveGroups.length > 0;

  let level = BASE_LEVEL[band.id];
  if (hasSensitiveMembers && band.id !== "good") level = bump(level);

  const outdoorRule = (() => {
    switch (level) {
      case "low":
        return "Outdoor activity is fine for everyone.";
      case "moderate":
        return hasSensitiveMembers
          ? "Keep outdoor time short for sensitive members and avoid hard exercise outside."
          : "Outdoor activity is fine; ease off if you notice coughing or a sore throat.";
      case "high":
        return "Move exercise indoors. Short trips outside only, with a well-fitted N95 mask.";
      case "severe":
        return "Stay indoors with windows shut. Go out only when needed, wearing an N95.";
    }
  })();

  return {
    level,
    hasSensitiveMembers,
    sensitiveGroups,
    outdoorRule,
    maskAdvised: level === "high" || level === "severe",
  };
}
