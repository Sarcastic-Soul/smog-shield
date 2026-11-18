import { pm25ToAqi } from "../air/aqi";
import { clockOf, dateOf, hourOf, type HourlyAir } from "../air/types";
import { mean, roundTo } from "../math";

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

function windowAt(hours: HourlyAir[], index: number, size: number): AirWindow {
  const slice = hours.slice(index, index + size);
  const avgPm25 = roundTo(mean(slice.map((h) => h.pm25)));
  return {
    start: slice[0].time,
    end: hourAfter(slice[slice.length - 1].time),
    avgAqi: pm25ToAqi(avgPm25),
    avgPm25,
  };
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

  for (let i = 0; i < hours.length; i++) {
    pmSum += hours[i].pm25;
    daytimeCount += isDaytime(hours[i]) ? 1 : 0;
    if (i >= size) {
      pmSum -= hours[i - size].pm25;
      daytimeCount -= isDaytime(hours[i - size]) ? 1 : 0;
    }
    if (i < size - 1) continue;

    const start = i - size + 1;
    // All hours in daytime and on the same calendar day.
    if (daytimeCount !== size || dateOf(hours[start].time) !== dateOf(hours[i].time)) continue;
    if (pmSum < bestSum) {
      bestSum = pmSum;
      bestIndex = start;
    }
    if (pmSum > worstSum) {
      worstSum = pmSum;
      worstIndex = start;
    }
  }

  if (bestIndex < 0) return null;
  return { best: windowAt(hours, bestIndex, size), worst: windowAt(hours, worstIndex, size) };
}

/** "07:00" style label from a local time string. */
export const clockLabel = clockOf;

/** "today" or "tomorrow" relative to `now`, both local `YYYY-MM-DDTHH:mm` strings. */
export function dayOf(localTime: string, now: string): "today" | "tomorrow" {
  return dateOf(localTime) > dateOf(now) ? "tomorrow" : "today";
}
