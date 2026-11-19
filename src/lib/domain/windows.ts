import { pm25ToAqi } from "@/lib/air/aqi";
import { dateOf, hourOf, type HourlyAir } from "@/lib/air/types";
import { mean, roundTo } from "@/lib/math";

export interface AirWindow {
  /** Local start time, `YYYY-MM-DDTHH:mm`. */
  start: string;
  /** Local end time (exclusive), `YYYY-MM-DDTHH:mm`. */
  end: string;
  /** AQI of the window's average hourly PM2.5 (not the official 24 h AQI). */
  avgAqi: number;
  avgPm25: number;
}

/** Hours when families are realistically out: 06:00 to 21:00. */
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 21;

const isDaytime = (h: HourlyAir) => {
  const hour = hourOf(h.time);
  return hour >= DAY_START_HOUR && hour < DAY_END_HOUR;
};

/** Windows never pass DAY_END_HOUR, so the end hour stays on the same day. */
function hourAfter(localTime: string): string {
  return `${localTime.slice(0, 11)}${String(hourOf(localTime) + 1).padStart(2, "0")}:00`;
}

/** Summary of consecutive hours, or null for an empty slice. */
function windowOf(slice: HourlyAir[]): AirWindow | null {
  const first = slice[0];
  const last = slice.at(-1);
  if (!first || !last) return null;
  const avgPm25 = roundTo(mean(slice.map((h) => h.pm25)));
  return { start: first.time, end: hourAfter(last.time), avgAqi: pm25ToAqi(avgPm25), avgPm25 };
}

/**
 * Finds the cleanest and dirtiest daytime windows of `size` consecutive hours.
 * Ranked by hourly PM2.5, because the US AQI is a 24-hour rolling average and
 * hides the hour-to-hour swings that matter when planning a walk.
 * Sliding sums over PM2.5 and over a daytime flag keep this a single O(n) pass.
 */
export function findWindows(hours: HourlyAir[], size = 2): { best: AirWindow; worst: AirWindow } | null {
  let bestIndex = -1;
  let worstIndex = -1;
  let bestSum = Number.POSITIVE_INFINITY;
  let worstSum = Number.NEGATIVE_INFINITY;
  let pmSum = 0;
  let daytimeCount = 0;

  for (const [i, hour] of hours.entries()) {
    pmSum += hour.pm25;
    daytimeCount += isDaytime(hour) ? 1 : 0;
    const leaving = hours[i - size];
    if (leaving) {
      pmSum -= leaving.pm25;
      daytimeCount -= isDaytime(leaving) ? 1 : 0;
    }

    const start = i - size + 1;
    const first = hours[start];
    // A full window, all in daytime, on one calendar day.
    if (!first || daytimeCount !== size || dateOf(first.time) !== dateOf(hour.time)) continue;
    if (pmSum < bestSum) {
      bestSum = pmSum;
      bestIndex = start;
    }
    if (pmSum > worstSum) {
      worstSum = pmSum;
      worstIndex = start;
    }
  }

  const best = windowOf(hours.slice(bestIndex, bestIndex + size));
  const worst = windowOf(hours.slice(worstIndex, worstIndex + size));
  return bestIndex >= 0 && best && worst ? { best, worst } : null;
}

/** "today" or "tomorrow" relative to `now`, both local `YYYY-MM-DDTHH:mm` strings. */
export function dayOf(localTime: string, now: string): "today" | "tomorrow" {
  return dateOf(localTime) > dateOf(now) ? "tomorrow" : "today";
}
