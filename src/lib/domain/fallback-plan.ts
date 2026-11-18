import { hourOf, type AirReport } from "../air/types";
import { COMMUNITY_SCALES } from "./impact";
import type { Insights } from "./insights";
import type { Plan } from "./plan";
import type { SensitiveGroupId } from "./risk";
import { COMMUTE_LABELS, COOKING_LABELS, type Profile } from "./profile";
import { clockLabel } from "./windows";

/** Above this AQI, windows stay shut and the purifier runs from the morning. */
const SMOGGY_AQI = 150;

type Step = Omit<Plan["routine"][number], "day">;

/**
 * Puts steps in order starting from the current local hour. A step whose time
 * has already passed today moves to tomorrow.
 */
export function scheduleFromNow(steps: Step[], nowTime: string): Plan["routine"] {
  const nowMinutes = hourOf(nowTime) * 60 + Number(nowTime.slice(14, 16));
  const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return steps
    .map((step) => ({ ...step, day: minutesOf(step.time) >= nowMinutes ? ("today" as const) : ("tomorrow" as const) }))
    .sort((a, b) => (a.day === b.day ? a.time.localeCompare(b.time) : a.day === "today" ? -1 : 1));
}

function routineSteps(profile: Profile, report: AirReport, insights: Insights): Step[] {
  const { risk, windows, indoor, commute, cooking, exercise, mask } = insights;
  const smoggy = report.now.aqi > SMOGGY_AQI;
  const steps: Step[] = [
    {
      time: "07:00",
      activity: smoggy ? "Keep windows shut; run the purifier in the main room" : "Air out the home for 10 minutes",
      why: smoggy
        ? `Outdoor PM2.5 is ${report.now.pm25} µg/m³, ${insights.timesWhoLimit}× the WHO daily limit.`
        : "Morning air is acceptable, so a short airing clears indoor build-up.",
    },
  ];

  if (commute.weeklyKm > 0) {
    const mode = COMMUTE_LABELS[profile.commute.mode].toLowerCase();
    steps.push({
      time: "08:30",
      activity: risk.maskAdvised ? `Commute by ${mode} with an N95 on` : `Commute by ${mode}`,
      why: risk.maskAdvised
        ? `An N95 cuts what you breathe on a 1-hour trip from about ${mask.doseNoMask} µg to ${mask.doseWithN95} µg of PM2.5.`
        : "Air is clean enough that no mask is needed.",
    });
  }

  if (windows) {
    const minutes = profile.home.outdoorExerciseMinutes;
    steps.push({
      time: clockLabel(windows.best.start),
      activity:
        minutes > 0 && risk.level !== "severe"
          ? `Outdoor walk or play (${minutes} min) in the cleanest window`
          : "Run errands or school pick-up in the cleanest window",
      why: exercise
        ? `PM2.5 averages ${windows.best.avgPm25} µg/m³ here versus ${windows.worst.avgPm25} at the daytime peak; you breathe ${exercise.cutPercent}% less.`
        : `PM2.5 averages ${windows.best.avgPm25} µg/m³, the lowest daytime level in the forecast.`,
    });
    steps.push({
      time: clockLabel(windows.worst.start),
      activity: "Stay inside, keep doors closed, avoid busy roads",
      why: `Forecast peak: PM2.5 ${windows.worst.avgPm25} µg/m³ between ${clockLabel(windows.worst.start)} and ${clockLabel(windows.worst.end)}.`,
    });
  }

  steps.push(
    {
      time: "19:30",
      activity: "Cook with the exhaust fan or chimney on, lid on pots",
      why: `${COOKING_LABELS[cooking.fuel]} adds about ${cooking.addedPm25} µg/m³ of PM2.5 to the kitchen while cooking.`,
    },
    {
      time: "22:00",
      activity: "Close bedroom windows and run the purifier overnight",
      why: `Sleep is a third of the day; a purifier takes bedroom PM2.5 from ~${indoor.indoorPm25} to ~${indoor.indoorWithPurifier} µg/m³.`,
    },
  );

  // Drop fixed-time steps that clash with a forecast window step.
  const seen = new Set<string>();
  return steps.filter((step) => !seen.has(step.time) && seen.add(step.time));
}

function indoorHacks(profile: Profile, report: AirReport, insights: Insights): Plan["indoorHacks"] {
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
      impact: "Removes about 40 µg/m³ of extra indoor PM2.5 for the whole household.",
    });
  }
  if (cooking.isPolluting) {
    hacks.unshift({
      title: "Move cooking away from wood or kerosene",
      action: "Switch to LPG or induction for daily meals, or cook near an open window if you cannot.",
      impact: `Cuts kitchen PM2.5 from ~${cooking.addedPm25} µg/m³ to under 30 µg/m³ during cooking.`,
    });
  }
  return hacks.slice(0, 6);
}

function alternatives(profile: Profile, insights: Insights): Plan["alternatives"] {
  const swaps: Plan["alternatives"] = insights.commute.swaps.slice(0, 3).map((swap) => ({
    swap: `${COMMUTE_LABELS[profile.commute.mode]} → ${COMMUTE_LABELS[swap.to]}`,
    action:
      swap.to === "work_from_home"
        ? "Ask for remote days on the worst smog days of the week."
        : `Take the ${COMMUTE_LABELS[swap.to].toLowerCase()} for your ${profile.commute.distanceKm} km trip.`,
    impact: `Saves ${swap.co2KgSavedPerWeek} kg CO₂ a week (${swap.co2KgSavedPerYear} kg a year) and ${swap.pm25GramsSavedPerWeek} g of tailpipe PM2.5.`,
  }));

  if (insights.heatingHazard !== "none") {
    swaps.push({
      swap: "Fire or gas heater → electric heater or heat pump",
      action: "Heat one closed room with an oil-filled radiator or inverter AC instead of burning fuel indoors.",
      impact: "Removes the indoor carbon monoxide and NO₂ source and the soot it adds to your room.",
    });
  } else {
    swaps.push({
      swap: "Burning leaves or waste → composting",
      action: "Bag dry leaves and kitchen waste for compost instead of burning them.",
      impact: "Open burning is one of the largest winter sources of local PM2.5 in many cities.",
    });
  }
  return swaps.slice(0, 5);
}

function communityActions(profile: Profile, insights: Insights): Plan["communityActions"] {
  const building = COMMUNITY_SCALES.find((scale) => scale.id === "building")!;
  const actions: Plan["communityActions"] = [];

  const shared = insights.commute.swaps.find((swap) => swap.to !== "work_from_home");
  if (insights.community && shared) {
    actions.push({
      who: "Your building or lane",
      action: `Start a carpool or shared ${COMMUTE_LABELS[shared.to].toLowerCase()} trip with neighbours on smog days.`,
      impact: `If ${building.households} homes make this swap, that is ${insights.community.co2TonnesPerYear} t of CO₂ a year saved.`,
    });
  }
  if (profile.household.children > 0) {
    actions.push({
      who: "Your child's school",
      action: "Ask the school to move outdoor PE and assembly indoors when AQI is above 200.",
      impact: `Today's worst window reaches PM2.5 ${insights.windows?.worst.avgPm25 ?? "high"} µg/m³; children breathe more air per kg than adults.`,
    });
  }
  actions.push({
    who: "Your resident welfare association",
    action: profile.home.wasteBurningNearby
      ? "Report the waste burning near you to the municipal helpline and ask the RWA to arrange compost pick-up."
      : "Agree on a no-burning rule for leaves and waste, and share one purifier-equipped room for older neighbours.",
    impact: `Local burning adds to today's PM2.5 of ${insights.indoor.outdoorPm25} µg/m³, ${insights.timesWhoLimit}× the WHO limit.`,
  });
  return actions.slice(0, 4);
}

/** Group-specific advice; a mask line is added when the air calls for one. */
const GROUP_ADVICE: Record<SensitiveGroupId, string> = {
  children: "Swap outdoor play for indoor games during peak hours; children breathe more air per kg than adults.",
  seniors: "Move morning walks to the cleanest window or indoors, and keep blood pressure and heart medicines handy.",
  asthma: "Keep the reliever inhaler close and follow the asthma action plan; avoid exercise outside today.",
  copd: "Stay in the clean room as much as possible and use prescribed inhalers as your doctor advised.",
  heart_disease: "Avoid exertion outdoors; chest pain or unusual breathlessness needs a doctor straight away.",
  pregnancy: "Limit time near traffic and smoke; rest in the cleanest room and keep antenatal check-ups.",
  allergies: "Keep windows shut, rinse your nose and eyes after being outside, and wash bedding often.",
};

function adviceFor(id: SensitiveGroupId, maskAdvised: boolean): string {
  const mask = id === "children" ? " Outside, use a child-size N95." : " Outside, wear a snug N95.";
  return GROUP_ADVICE[id] + (maskAdvised ? mask : "");
}

/**
 * Deterministic plan used when Gemini is unavailable, slow, or returns
 * something that fails validation. It uses the same facts, so the advice is
 * still specific to the household and the forecast.
 */
export function buildFallbackPlan(profile: Profile, report: AirReport, insights: Insights): Plan {
  const { risk } = insights;
  const groupAdvice = risk.sensitiveGroups.map((group) => ({
    group: group.label,
    advice: adviceFor(group.id, risk.maskAdvised),
  }));

  return {
    headline: `${insights.band.label} air in ${report.place.name} — ${risk.level} risk for your home`,
    summary: `AQI is ${report.now.aqi} with PM2.5 at ${report.now.pm25} µg/m³, like smoking ${insights.cigarettesPerDay} cigarettes a day. ${risk.outdoorRule}`,
    routine: scheduleFromNow(routineSteps(profile, report, insights), report.now.time).slice(0, 8),
    indoorHacks: indoorHacks(profile, report, insights),
    alternatives: alternatives(profile, insights),
    communityActions: communityActions(profile, insights),
    groupAdvice: groupAdvice.slice(0, 6),
  };
}

/**
 * Fills gaps in a Gemini plan with rule-based items so every plan meets the
 * same minimum: three indoor fixes, three swaps and two community actions. Gemini's own
 * wording always comes first. Only used for English plans, so languages are
 * never mixed.
 */
export function reconcilePlan(ai: Plan, fallback: Plan): Plan {
  const fill = <T>(primary: T[], extra: T[], min: number, max: number, key: (item: T) => string) => {
    const keys = new Set(primary.map(key));
    const added = extra.filter((item) => !keys.has(key(item))).slice(0, Math.max(0, min - primary.length));
    return [...primary, ...added].slice(0, max);
  };
  return {
    ...ai,
    indoorHacks: fill(ai.indoorHacks, fallback.indoorHacks, 3, 6, (h) => h.title.toLowerCase()),
    alternatives: fill(ai.alternatives, fallback.alternatives, 3, 5, (a) => a.swap.toLowerCase()),
    communityActions: fill(ai.communityActions, fallback.communityActions, 2, 4, (c) => c.who.toLowerCase()),
  };
}
