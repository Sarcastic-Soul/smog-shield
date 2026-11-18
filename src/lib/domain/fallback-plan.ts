import type { AirReport } from "../air/types";
import type { Insights } from "./insights";
import type { Plan } from "./plan";
import { COMMUTE_LABELS, COOKING_LABELS, type Profile } from "./profile";
import { clockLabel } from "./windows";

/**
 * Deterministic plan used when Gemini is unavailable, slow, or returns
 * something that fails validation. It uses the same facts, so the advice is
 * still specific to the household and the forecast.
 */
export function buildFallbackPlan(profile: Profile, report: AirReport, insights: Insights): Plan {
  const { risk, windows, indoor, commute, cooking, exercise, mask } = insights;
  const smoggy = report.now.aqi > 150;
  const routine: Plan["routine"] = [];

  routine.push({
    time: "07:00",
    activity: smoggy ? "Keep windows shut; run the purifier in the main room" : "Air out the home for 10 minutes",
    why: smoggy
      ? `Outdoor PM2.5 is ${report.now.pm25} µg/m³, ${insights.timesWhoLimit}× the WHO daily limit.`
      : "Morning air is acceptable, so a short airing clears indoor build-up.",
  });

  if (commute.weeklyKm > 0) {
    routine.push({
      time: "08:30",
      activity: risk.maskAdvised
        ? `Commute by ${COMMUTE_LABELS[profile.commute.mode].toLowerCase()} with an N95 on`
        : `Commute by ${COMMUTE_LABELS[profile.commute.mode].toLowerCase()}`,
      why: risk.maskAdvised
        ? `An N95 cuts what you breathe on a 1-hour trip from about ${mask.doseNoMask} µg to ${mask.doseWithN95} µg of PM2.5.`
        : "Air is clean enough that no mask is needed.",
    });
  }

  if (windows) {
    const minutes = profile.home.outdoorExerciseMinutes;
    routine.push({
      time: clockLabel(windows.best.start),
      activity:
        minutes > 0 && risk.level !== "severe"
          ? `Outdoor walk or play (${minutes} min) in the cleanest window`
          : "Run errands or school pick-up in the cleanest window",
      why: exercise
        ? `PM2.5 averages ${windows.best.avgPm25} µg/m³ here versus ${windows.worst.avgPm25} at the daytime peak; you breathe ${exercise.cutPercent}% less.`
        : `PM2.5 averages ${windows.best.avgPm25} µg/m³, the lowest daytime level in the forecast.`,
    });
    routine.push({
      time: clockLabel(windows.worst.start),
      activity: "Stay inside, keep doors closed, avoid busy roads",
      why: `Forecast peak: PM2.5 ${windows.worst.avgPm25} µg/m³ between ${clockLabel(windows.worst.start)} and ${clockLabel(windows.worst.end)}.`,
    });
  }

  routine.push({
    time: "19:30",
    activity: "Cook with the exhaust fan or chimney on, lid on pots",
    why: `${COOKING_LABELS[cooking.fuel]} adds about ${cooking.addedPm25} µg/m³ of PM2.5 to the kitchen while cooking.`,
  });

  routine.push({
    time: "22:00",
    activity: "Close bedroom windows and run the purifier overnight",
    why: `Sleep is a third of the day; a purifier takes bedroom PM2.5 from ~${indoor.indoorPm25} to ~${indoor.indoorWithPurifier} µg/m³.`,
  });

  routine.sort((a, b) => a.time.localeCompare(b.time));

  const indoorHacks: Plan["indoorHacks"] = [
    {
      title: profile.home.hasPurifier ? "Run your purifier in one closed room" : "Make one clean room",
      action: profile.home.hasPurifier
        ? "Keep it on high in the bedroom with the door shut. Change the HEPA filter when it greys."
        : "Pick the bedroom, seal window gaps with tape, and add a HEPA purifier or a box-fan with a MERV-13 filter strapped on.",
      impact: `Indoor PM2.5 drops about ${indoor.purifierCutPercent}%: from ~${indoor.indoorPm25} to ~${indoor.indoorWithPurifier} µg/m³.`,
    },
    {
      title: "Stop indoor smoke sources",
      action: "Skip incense, mosquito coils, candles and frying with the window closed on high-AQI days.",
      impact: "One incense stick can push room PM2.5 above 100 µg/m³ for an hour.",
    },
    {
      title: "Wet-clean, don't sweep",
      action: "Mop floors and wipe sills with a damp cloth; dry sweeping throws settled dust back into the air.",
      impact: "Cuts re-suspended coarse dust (PM10), which is high today at " + report.now.pm10 + " µg/m³ outdoors.",
    },
  ];

  if (cooking.isPolluting) {
    indoorHacks.unshift({
      title: "Move cooking away from wood or kerosene",
      action: "Switch to LPG or induction for daily meals, or cook outdoors / near an open window if you cannot.",
      impact: `Cuts kitchen PM2.5 from ~${cooking.addedPm25} µg/m³ to under 30 µg/m³ during cooking.`,
    });
  }

  const alternatives: Plan["alternatives"] = commute.swaps.slice(0, 3).map((swap) => ({
    swap: `${COMMUTE_LABELS[profile.commute.mode]} → ${COMMUTE_LABELS[swap.to]}`,
    action:
      swap.to === "work_from_home"
        ? "Ask for remote days on the worst smog days of the week."
        : `Take the ${COMMUTE_LABELS[swap.to].toLowerCase()} for your ${profile.commute.distanceKm} km trip.`,
    impact: `Saves ${swap.co2KgSavedPerWeek} kg CO₂ a week (${swap.co2KgSavedPerYear} kg a year) and ${swap.pm25GramsSavedPerWeek} g of tailpipe PM2.5.`,
  }));

  if (alternatives.length === 0) {
    alternatives.push({
      swap: "Skip burning leaves and waste",
      action: "Bag dry leaves for municipal compost and report open burning in your area.",
      impact: "Open burning is a top winter source of local PM2.5 in north Indian cities.",
    });
  }

  const groupAdvice: Plan["groupAdvice"] = risk.sensitiveGroups.map((group) => ({
    group,
    advice: risk.maskAdvised
      ? "Stay indoors through the peak hours. If going out, wear a snug N95 (child size for kids) and keep trips short."
      : "Limit long or hard activity outdoors; stop and rest if coughing or short of breath.",
  }));

  return {
    headline: `${insights.band.label} air in ${report.place.name} today — ${risk.level} risk for your home`,
    summary: `AQI is ${report.now.aqi} with PM2.5 at ${report.now.pm25} µg/m³, like smoking ${insights.cigarettesPerDay} cigarettes a day. ${risk.outdoorRule}`,
    routine: routine.slice(0, 8),
    indoorHacks: indoorHacks.slice(0, 6),
    alternatives,
    groupAdvice: groupAdvice.slice(0, 6),
  };
}
