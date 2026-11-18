import { pm25ToAqi } from "../air/aqi";
import { hourOf, type HourlyAir } from "../air/types";

export interface AirWindow {
  /** Local start time, `YYYY-MM-DDTHH:mm`. */
  start: string;
  /** Local end time (exclusive), `YYYY-MM-DDTHH:mm`. */
  end: string;
  /** Hourly-PM2.5 AQI for the window's average (not the 24 h official AQI). */
  avgAqi: number;
  avgPm25: number;
}

/** Hours when families are realistically out: 06:00 to 21:00. */
const DAY_START = 6;
const DAY_END = 21;

function addHour(localTime: string): string {
  const hour = hourOf(localTime) + 1;
  // Only used for display labels, so wrapping 23 -> 24 is acceptable.
  return `${localTime.slice(0, 11)}${String(hour).padStart(2, "0")}:00`;
}

function windowAt(hours: HourlyAir[], index: number, size: number): AirWindow {
  const slice = hours.slice(index, index + size);
  const avg = (pick: (h: HourlyAir) => number) =>
    Math.round((slice.reduce((sum, h) => sum + pick(h), 0) / slice.length) * 10) / 10;

  const avgPm25 = avg((h) => h.pm25);
  return {
    start: slice[0].time,
    end: addHour(slice[slice.length - 1].time),
    avgAqi: pm25ToAqi(avgPm25),
    avgPm25,
  };
}

/**
 * Finds the cleanest and dirtiest daytime windows of `size` consecutive hours.
 * Ranked by hourly PM2.5, because the US AQI is a 24-hour rolling average and
 * hides the hour-to-hour swings that matter when planning a walk.
 * A sliding sum keeps this O(n) over the forecast.
 */
export function findWindows(
  hours: HourlyAir[],
  size = 2,
): { best: AirWindow; worst: AirWindow } | null {
  const daytime = (h: HourlyAir) => {
    const hour = hourOf(h.time);
    return hour >= DAY_START && hour < DAY_END;
  };

  let bestIndex = -1;
  let worstIndex = -1;
  let bestSum = Number.POSITIVE_INFINITY;
  let worstSum = Number.NEGATIVE_INFINITY;
  let sum = 0;

  for (let i = 0; i < hours.length; i++) {
    sum += hours[i].pm25;
    if (i >= size) sum -= hours[i - size].pm25;
    if (i < size - 1) continue;

    const start = i - size + 1;
    // Every hour in the window must be daytime and on the same day.
    const window = hours.slice(start, i + 1);
    if (!window.every(daytime) || window[0].time.slice(0, 10) !== window[size - 1].time.slice(0, 10)) {
      continue;
    }
    if (sum < bestSum) {
      bestSum = sum;
      bestIndex = start;
    }
    if (sum > worstSum) {
      worstSum = sum;
      worstIndex = start;
    }
  }

  if (bestIndex < 0) return null;
  return { best: windowAt(hours, bestIndex, size), worst: windowAt(hours, worstIndex, size) };
}

/** "07:00" style label from a local time string. */
export function clockLabel(localTime: string): string {
  return localTime.slice(11, 16);
}
