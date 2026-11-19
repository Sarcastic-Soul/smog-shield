import { z } from "zod";
import { mean, roundTo } from "../math";
import { pm25ToAqi } from "./aqi";
import { AirDataError, getJson, type FetchLike } from "./fetch-json";
import {
  dateOf,
  type AirReport,
  type DailyOutlook,
  type HourlyAir,
  type Place,
  type Pollutant,
  POLLUTANTS,
} from "./types";

/**
 * Air-quality client for the free Open-Meteo API (current readings, hourly
 * forecast and a 3-day outlook).
 * No API key is needed. Responses are validated before use so a bad upstream
 * payload fails loudly here instead of deep inside the UI.
 */

const AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";

/** Today plus three more days for the outlook (CAMS forecasts up to five). */
const FORECAST_DAYS = 4;
const OUTLOOK_DAYS = 3;
/** A forecast day with fewer hours than this (the cut-off last day) is left out of the outlook. */
const MIN_HOURS_FOR_DAILY_MEAN = 12;

const nullableNumber = z.number().nullable();

const airSchema = z.object({
  current: z.object({
    time: z.string(),
    us_aqi: nullableNumber,
    pm2_5: nullableNumber,
    pm10: nullableNumber,
    nitrogen_dioxide: nullableNumber,
    ozone: nullableNumber,
    carbon_monoxide: nullableNumber,
    us_aqi_pm2_5: nullableNumber.optional(),
    us_aqi_pm10: nullableNumber.optional(),
    us_aqi_nitrogen_dioxide: nullableNumber.optional(),
    us_aqi_ozone: nullableNumber.optional(),
    us_aqi_carbon_monoxide: nullableNumber.optional(),
    us_aqi_sulphur_dioxide: nullableNumber.optional(),
  }),
  hourly: z.object({
    time: z.array(z.string()),
    us_aqi: z.array(nullableNumber),
    pm2_5: z.array(nullableNumber),
  }),
});

const round1 = (n: number | null) => roundTo(n ?? 0);

const SUB_INDEX_FIELDS = {
  pm25: "us_aqi_pm2_5",
  pm10: "us_aqi_pm10",
  no2: "us_aqi_nitrogen_dioxide",
  ozone: "us_aqi_ozone",
  co: "us_aqi_carbon_monoxide",
  so2: "us_aqi_sulphur_dioxide",
} as const satisfies Record<Pollutant, string>;

const CURRENT_FIELDS = [
  "us_aqi",
  "pm2_5",
  "pm10",
  "nitrogen_dioxide",
  "ozone",
  "carbon_monoxide",
  ...Object.values(SUB_INDEX_FIELDS),
].join(",");

/** The pollutant with the highest AQI sub-index; PM2.5 when data is missing. */
export function dominantPollutant(
  current: Partial<Record<(typeof SUB_INDEX_FIELDS)[Pollutant], number | null>>,
): Pollutant {
  let best: Pollutant = "pm25";
  let bestValue = -1;
  for (const pollutant of POLLUTANTS) {
    const value = current[SUB_INDEX_FIELDS[pollutant]] ?? -1;
    if (value > bestValue) {
      best = pollutant;
      bestValue = value;
    }
  }
  return best;
}

/** Daily mean PM2.5 for each day after `today`, skipping missing hours. */
function buildOutlook(times: string[], pm25: (number | null)[], today: string): DailyOutlook[] {
  const byDay = new Map<string, number[]>();
  times.forEach((time, i) => {
    const date = dateOf(time);
    const value = pm25[i];
    if (date <= today || value === null) return;
    byDay.set(date, [...(byDay.get(date) ?? []), value]);
  });
  return [...byDay.entries()]
    .filter(([, values]) => values.length >= MIN_HOURS_FOR_DAILY_MEAN)
    .slice(0, OUTLOOK_DAYS)
    .map(([date, values]) => {
      const avgPm25 = roundTo(mean(values));
      return { date, avgPm25, aqi: pm25ToAqi(avgPm25) };
    });
}

export async function fetchAirReport(place: Place, fetcher: FetchLike = fetch): Promise<AirReport> {
  const url = new URL(AIR_URL);
  url.searchParams.set("latitude", place.latitude.toFixed(3));
  url.searchParams.set("longitude", place.longitude.toFixed(3));
  url.searchParams.set("current", CURRENT_FIELDS);
  url.searchParams.set("hourly", "us_aqi,pm2_5");
  url.searchParams.set("forecast_days", String(FORECAST_DAYS));
  url.searchParams.set("timezone", "auto");

  const parsed = airSchema.safeParse(await getJson(url, fetcher));
  if (!parsed.success) throw new AirDataError("Air quality data was incomplete", "upstream");

  const { current, hourly } = parsed.data;
  // Hourly times share the current format, so string comparison is safe.
  const currentHour = current.time.slice(0, 13);
  const next24h: HourlyAir[] = [];
  for (let i = 0; i < hourly.time.length && next24h.length < 24; i++) {
    const aqi = hourly.us_aqi[i];
    if (hourly.time[i].slice(0, 13) < currentHour || aqi === null) continue;
    next24h.push({ time: hourly.time[i], aqi: Math.round(aqi), pm25: round1(hourly.pm2_5[i]) });
  }

  return {
    place,
    now: {
      time: current.time,
      aqi: Math.round(current.us_aqi ?? next24h[0]?.aqi ?? 0),
      pm25: round1(current.pm2_5),
      pm10: round1(current.pm10),
      no2: round1(current.nitrogen_dioxide),
      ozone: round1(current.ozone),
      co: round1(current.carbon_monoxide),
      dominant: dominantPollutant(current),
    },
    next24h,
    outlook: buildOutlook(hourly.time, hourly.pm2_5, dateOf(current.time)),
    source: "open-meteo",
  };
}
