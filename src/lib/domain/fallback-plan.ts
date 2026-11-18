import { clockOf, minutesOfClock, POLLUTANT_LABELS, type AirReport } from "../air/types";
import { BUILDING_SCALE, SMOKER_INDOOR_PM25 } from "./impact";
import type { Insights } from "./insights";
import { PLAN_LIMITS, type Plan } from "./plan";
import { COMMUTE_LABELS, COOKING_LABELS, type Profile } from "./profile-options";
import type { SensitiveGroupId } from "./risk";
import { clockLabel } from "./windows";

/** Above this AQI, windows stay shut and the purifier runs from the morning. */
const SMOGGY_AQI = 150;
/** Below this hourly AQI a "worst window" is not worth warning about. */
const WORTH_AVOIDING_AQI = 100;

type Step = Omit<Plan["routine"][number], "day">;

/**
 * Puts steps in order starting from the current local hour. A step whose time
 * has already passed today moves to tomorrow.
 */
export function scheduleFromNow(steps: Step[], nowTime: string): Plan["routine"] {
  const nowMinutes = minutesOfClock(clockOf(nowTime));
  return steps
    .map((step) => ({
      ...step,
      day: minutesOfClock(step.time) >= nowMinutes ? ("today" as const) : ("tomorrow" as const),
    }))
    .sort((a, b) => (a.day === b.day ? a.time.localeCompare(b.time) : a.day === "today" ? -1 : 1));
}

/**
 * Finds a clock time such as "5pm", "5:30 pm" or "17:00" in the family's note,
 * so their own plan can be moved to cleaner air even without the AI.
 */
export function timeInNotes(notes: string): string | null {
  const twelveHour = /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*(am|pm)\b/i.exec(notes);
  if (twelveHour) {
    const hour = (Number(twelveHour[1]) % 12) + (twelveHour[3].toLowerCase() === "pm" ? 12 : 0);
    return `${String(hour).padStart(2, "0")}:${twelveHour[2] ?? "00"}`;
  }
  const twentyFour = /\b([01]\d|2[0-3]):([0-5]\d)\b/.exec(notes);
  return twentyFour ? `${twentyFour[1]}:${twentyFour[2]}` : null;
}

/** Lower-cases a label for mid-sentence use, keeping acronyms such as "CNG". */
export function inSentence(label: string): string {
  return label.replace(/^([A-Z])(?![A-Z])/, (first) => first.toLowerCase());
}

/** "the purifier" or the DIY alternative, so homes without one are not told to run it. */
function filterName(profile: Profile): string {
  return profile.home.hasPurifier ? "the purifier" : "a box-fan filter";
}

function routineSteps(profile: Profile, report: AirReport, insights: Insights): Step[] {
  const { risk, windows, indoor, commute, cooking, exercise, mask } = insights;
  const smoggy = report.now.aqi > SMOGGY_AQI;
  const filter = filterName(profile);
  const steps: Step[] = [
    {
      time: "07:00",
      activity: smoggy ? `Keep windows shut; run ${filter} in the main room` : "Air out the home for 10 minutes",
      why: smoggy
        ? `Outdoor PM2.5 is ${report.now.pm25} µg/m³, ${insights.timesWhoLimit}× the WHO daily limit.`
        : `AQI is ${report.now.aqi}, so a short airing clears indoor build-up.`,
    },
  ];

  if (commute.weeklyKm > 0) {
    const mode = inSentence(COMMUTE_LABELS[profile.commute.mode]);
    steps.push({
      time: "08:30",
      activity: risk.maskAdvised ? `Commute by ${mode} with an N95 on` : `Commute by ${mode}`,
      why: risk.maskAdvised
        ? `An N95 cuts what you breathe on a 1-hour trip from about ${mask.doseNoMask} µg to ${mask.doseWithN95} µg of PM2.5.`
        : `AQI ${report.now.aqi} is low enough that no mask is needed.`,
    });
  }

  if (windows) {
    const minutes = profile.home.outdoorExerciseMinutes;
    const outdoorOk = risk.level !== "severe";
    steps.push({
      time: clockLabel(windows.best.start),
      activity:
        minutes > 0 && outdoorOk
          ? `Outdoor walk or play (${minutes} min) in the cleanest window`
          : "Run errands or school pick-up in the cleanest window",
      why:
        exercise && outdoorOk
          ? `PM2.5 averages ${windows.best.avgPm25} µg/m³ here versus ${windows.worst.avgPm25} at the daytime peak; you breathe ${exercise.cutPercent}% less.`
          : `PM2.5 averages ${windows.best.avgPm25} µg/m³, the lowest daytime level in the forecast.`,
    });
    if (windows.worst.avgAqi > WORTH_AVOIDING_AQI) {
      steps.push({
        time: clockLabel(windows.worst.start),
        activity: "Stay inside, keep doors closed, avoid busy roads",
        why: `Forecast peak: PM2.5 ${windows.worst.avgPm25} µg/m³ between ${clockLabel(windows.worst.start)} and ${clockLabel(windows.worst.end)}.`,
      });
    }
    if (exercise && !outdoorOk) {
      steps.push({
        time: "17:30",
        activity: `Do your ${minutes}-min exercise indoors with ${filter} on`,
        why: `Indoors you breathe about ${exercise.indoorDose} µg of PM2.5 instead of ${exercise.doseAtWorst} µg outside at the peak.`,
      });
    }
  }

  const noteTime = timeInNotes(profile.notes);
  if (noteTime && windows && windows.worst.avgAqi > WORTH_AVOIDING_AQI) {
    steps.push({
      time: noteTime,
      activity: `Your plan at ${noteTime}: move it to ${clockLabel(windows.best.start)} or indoors if you can`,
      why: `The cleanest window averages PM2.5 ${windows.best.avgPm25} µg/m³ against ${windows.worst.avgPm25} at the peak.`,
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
      activity: smoggy
        ? `Close bedroom windows and run ${filter} overnight`
        : "Close windows before bed as the air cools and pollution settles",
      why: `Sleep is a third of the day; filtering takes bedroom PM2.5 from ~${indoor.indoorPm25} to ~${indoor.indoorWithPurifier} µg/m³.`,
    },
  );

  // Drop fixed-time steps that clash with a forecast or note step.
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
      impact: `Removes about ${SMOKER_INDOOR_PM25} µg/m³ of extra indoor PM2.5 for the whole household.`,
    });
  }
  if (cooking.isPolluting) {
    hacks.unshift({
      title: "Move cooking away from wood or kerosene",
      action: "Switch to LPG or induction for daily meals, or cook near an open window if you cannot.",
      impact: `Cuts kitchen PM2.5 from ~${cooking.addedPm25} µg/m³ to under 30 µg/m³ during cooking.`,
    });
  }
  return hacks.slice(0, PLAN_LIMITS.indoorHacksMax);
}

/** The swap's target mode name as used in matching text, e.g. "metro" for "Metro / train". */
export function swapKeyword(label: string): string {
  return label.split(" / ")[0].toLowerCase();
}

function alternatives(profile: Profile, insights: Insights): Plan["alternatives"] {
  const swaps: Plan["alternatives"] = insights.commute.swaps.slice(0, 3).map((swap) => ({
    swap: `${COMMUTE_LABELS[profile.commute.mode]} → ${COMMUTE_LABELS[swap.to]}`,
    action:
      swap.to === "work_from_home"
        ? "Ask for remote days on the worst smog days of the week."
        : `Take the ${inSentence(COMMUTE_LABELS[swap.to])} for your ${profile.commute.distanceKm} km trip.`,
    impact: `Saves ${swap.co2KgSavedPerWeek} kg CO₂ a week (${swap.co2KgSavedPerYear} kg a year) and ${swap.pm25GramsSavedPerWeek} g of tailpipe PM2.5.`,
  }));

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
      impact: `Cuts kitchen PM2.5 from ~${insights.cooking.addedPm25} µg/m³ to under 30 µg/m³ while cooking.`,
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

function communityActions(profile: Profile, insights: Insights): Plan["communityActions"] {
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
      action: "Ask the school to move outdoor PE and assembly indoors when AQI is above 200.",
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

/** Group-specific advice; a mask line is added when the air calls for one. */
const GROUP_ADVICE: Record<SensitiveGroupId, string> = {
  children: "Swap outdoor play for indoor games during peak hours; children breathe more air per kg than adults.",
  seniors: "Move morning walks to the cleanest window or indoors, and keep blood pressure and heart medicines handy.",
  asthma: "Keep the reliever inhaler close and follow the asthma action plan; avoid hard exercise outside today.",
  copd: "Stay in the cleanest room as much as possible and use prescribed inhalers as your doctor advised.",
  heart_disease: "Avoid exertion outdoors; chest pain or unusual breathlessness needs a doctor straight away.",
  pregnancy: "Limit time near traffic and smoke; rest in the cleanest room and keep antenatal check-ups.",
  allergies: "Keep windows shut at peak hours, rinse your nose and eyes after being outside, and wash bedding often.",
};

function adviceFor(id: SensitiveGroupId, maskAdvised: boolean): string {
  const mask = id === "children" ? " Outside, use a child-size N95." : " Outside, wear a snug N95.";
  return GROUP_ADVICE[id] + (maskAdvised ? mask : "");
}

function summaryOf(report: AirReport, insights: Insights): string {
  const { now } = report;
  const smoke = `PM2.5 is ${now.pm25} µg/m³, like smoking ${insights.cigarettesPerDay} cigarettes a day`;
  const cause =
    now.dominant === "pm25"
      ? `AQI is ${now.aqi}, driven by fine particles. ${smoke}.`
      : `AQI is ${now.aqi}, driven mostly by ${POLLUTANT_LABELS[now.dominant]}. ${smoke}.`;
  return `${cause} ${insights.risk.outdoorRule}`;
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
    summary: summaryOf(report, insights),
    routine: scheduleFromNow(routineSteps(profile, report, insights), report.now.time).slice(0, PLAN_LIMITS.routineMax),
    indoorHacks: indoorHacks(profile, report, insights),
    alternatives: alternatives(profile, insights),
    communityActions: communityActions(profile, insights),
    groupAdvice: groupAdvice.slice(0, PLAN_LIMITS.groupAdviceMax),
  };
}

/** Adds `extra` items whose key is not in `primary` until `min` is reached. */
function topUp<T>(primary: T[], extra: T[], min: number, max: number, isCovered: (item: T) => boolean): T[] {
  const added = extra.filter((item) => !isCovered(item)).slice(0, Math.max(0, min - primary.length));
  return [...primary, ...added].slice(0, max);
}

/**
 * Fills gaps in a Gemini plan with rule-based items so every plan meets the
 * same minimum: three indoor fixes, every top commute swap, and two community
 * actions. Gemini's own wording always comes first. Only used for English
 * plans, so languages are never mixed.
 */
export function reconcilePlan(ai: Plan, fallback: Plan): Plan {
  const aiSwapText = ai.alternatives.map((a) => `${a.swap} ${a.action}`.toLowerCase()).join(" | ");
  // A rule swap is covered when Gemini already mentions its target mode.
  const missingCommuteSwaps = fallback.alternatives.filter((alt) => {
    const target = alt.swap.split(" → ")[1];
    return target && !aiSwapText.includes(swapKeyword(target));
  });

  const titles = new Set(ai.indoorHacks.map((h) => h.title.toLowerCase()));
  const groups = new Set(ai.communityActions.map((c) => c.who.toLowerCase()));
  return {
    ...ai,
    indoorHacks: topUp(ai.indoorHacks, fallback.indoorHacks, 3, PLAN_LIMITS.indoorHacksMax, (h) =>
      titles.has(h.title.toLowerCase()),
    ),
    alternatives: [...ai.alternatives, ...missingCommuteSwaps].slice(0, PLAN_LIMITS.alternativesMax),
    communityActions: topUp(ai.communityActions, fallback.communityActions, 2, PLAN_LIMITS.communityActionsMax, (c) =>
      groups.has(c.who.toLowerCase()),
    ),
  };
}
