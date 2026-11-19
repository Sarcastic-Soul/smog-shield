import { clockOf, minutesOfClock, type AirReport } from "@/lib/air/types";
import type { Insights } from "@/lib/domain/insights";
import type { Plan } from "@/lib/domain/plan";
import { COMMUTE_LABELS, COOKING_LABELS, type Profile } from "@/lib/domain/profile-options";
import { filterName, inSentence, timeInNotes } from "@/lib/domain/rules/text";

/* The "next 24 hours" routine of the rule-based plan. */

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

export function buildRoutine(profile: Profile, report: AirReport, insights: Insights): Step[] {
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
      time: clockOf(windows.best.start),
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
        time: clockOf(windows.worst.start),
        activity: "Stay inside, keep doors closed, avoid busy roads",
        why: `Forecast peak: PM2.5 ${windows.worst.avgPm25} µg/m³ between ${clockOf(windows.worst.start)} and ${clockOf(windows.worst.end)}.`,
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
      activity: `Your plan at ${noteTime}: move it to ${clockOf(windows.best.start)} or indoors if you can`,
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
