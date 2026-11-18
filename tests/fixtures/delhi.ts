import { pm25ToAqi } from "@/lib/air/aqi";
import type { AirReport, DailyOutlook, HourlyAir, Place } from "@/lib/air/types";
import { mean, roundTo } from "@/lib/math";

/**
 * Realistic winter day for New Delhi. PM2.5 sits between 45 and 120 µg/m³:
 * cleanest around 12:00-14:00, dirtiest around 19:00-21:00.
 */
export const DELHI_PLACE: Place = {
  name: "New Delhi",
  region: "Delhi",
  country: "India",
  latitude: 28.6358,
  longitude: 77.2245,
  timezone: "Asia/Kolkata",
};

/** PM2.5 by hour of day, µg/m³. */
const PM25_BY_HOUR = [
  95, 98, 100, 102, 105, 108, 110, 100, 88, 75, 62, 52, 46, 45, 50, 60, 75, 92, 110, 120, 118, 112, 105, 98,
];

const aqiFor = (pm25: number) => Math.round(pm25 * 1.9);

export const TODAY = "2026-01-15";
export const TOMORROW = "2026-01-16";
export const DAY_AFTER = "2026-01-17";
export const DAY_THREE = "2026-01-18";
export const NOW_HOUR = 10;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** 96 hourly points, today 00:00 to the end of day four (forecast_days=4). */
export function hourlyPoints(): { time: string; pm25: number; aqi: number }[] {
  const points: { time: string; pm25: number; aqi: number }[] = [];
  for (const date of [TODAY, TOMORROW, DAY_AFTER, DAY_THREE]) {
    for (let h = 0; h < 24; h++) {
      const pm25 = PM25_BY_HOUR[h];
      points.push({ time: `${date}T${pad(h)}:00`, pm25, aqi: aqiFor(pm25) });
    }
  }
  return points;
}

/** Raw geocoding API answer for "New Delhi". */
export const geocodeResponse = {
  results: [
    {
      id: 1261481,
      name: "New Delhi",
      latitude: 28.6358,
      longitude: 77.2245,
      country: "India",
      admin1: "Delhi",
      timezone: "Asia/Kolkata",
    },
  ],
};

/** Raw Open-Meteo air-quality API answer, current hour 10:00. */
export function airResponse() {
  const points = hourlyPoints();
  const now = PM25_BY_HOUR[NOW_HOUR];
  return {
    current: {
      time: `${TODAY}T${pad(NOW_HOUR)}:00`,
      us_aqi: aqiFor(now),
      pm2_5: now,
      pm10: 140.26,
      nitrogen_dioxide: 38.4,
      ozone: 21.1,
      carbon_monoxide: 910,
    },
    hourly: {
      time: points.map((p) => p.time),
      us_aqi: points.map((p) => p.aqi),
      pm2_5: points.map((p) => p.pm25),
    },
  };
}

/** Every day repeats the same curve, so each daily mean is 88.6 µg/m³. */
export function delhiOutlook(): DailyOutlook[] {
  const avgPm25 = roundTo(mean(PM25_BY_HOUR));
  return [TOMORROW, DAY_AFTER, DAY_THREE].map((date) => ({ date, avgPm25, aqi: pm25ToAqi(avgPm25) }));
}

/** The AirReport our code should build from the responses above. */
export function delhiReport(): AirReport {
  const next24h: HourlyAir[] = hourlyPoints()
    .slice(NOW_HOUR, NOW_HOUR + 24)
    .map((p) => ({ time: p.time, aqi: p.aqi, pm25: p.pm25 }));
  const now = PM25_BY_HOUR[NOW_HOUR];
  return {
    place: DELHI_PLACE,
    now: {
      time: `${TODAY}T${pad(NOW_HOUR)}:00`,
      aqi: aqiFor(now),
      pm25: now,
      pm10: 140.3,
      no2: 38.4,
      ozone: 21.1,
      co: 910,
    },
    next24h,
    outlook: delhiOutlook(),
    source: "open-meteo",
  };
}
