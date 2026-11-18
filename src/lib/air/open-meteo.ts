import { z } from "zod";
import { mean, roundTo } from "../math";
import { pm25ToAqi } from "./aqi";
import type { AirReport, DailyOutlook, HourlyAir, Place } from "./types";

/**
 * Thin client for the free Open-Meteo geocoding and air-quality APIs.
 * No API key is needed. Responses are validated before use so a bad upstream
 * payload fails loudly here instead of deep inside the UI.
 */

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";
const AIR_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
const TIMEOUT_MS = 6000;
/** Today plus three more days for the outlook (CAMS forecasts up to five). */
const FORECAST_DAYS = 4;
const OUTLOOK_DAYS = 3;

export class AirDataError extends Error {
  constructor(
    message: string,
    readonly kind: "not_found" | "upstream",
  ) {
    super(message);
    this.name = "AirDataError";
  }
}

const geocodeSchema = z.object({
  results: z
    .array(
      z.object({
        name: z.string(),
        latitude: z.number(),
        longitude: z.number(),
        country: z.string().optional(),
        admin1: z.string().optional(),
        timezone: z.string().optional(),
      }),
    )
    .optional(),
});

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
  }),
  hourly: z.object({
    time: z.array(z.string()),
    us_aqi: z.array(nullableNumber),
    pm2_5: z.array(nullableNumber),
  }),
});

type FetchLike = typeof fetch;

/** One quick retry covers the odd dropped connection without slowing real failures much. */
const ATTEMPTS = 2;

async function getJson(url: URL, fetcher: FetchLike): Promise<unknown> {
  let response: Response | undefined;
  for (let attempt = 1; attempt <= ATTEMPTS && !response; attempt++) {
    try {
      response = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.status >= 500 && attempt < ATTEMPTS) response = undefined;
    } catch (error) {
      console.warn(`Open-Meteo request failed (attempt ${attempt})`, (error as Error).cause ?? error);
    }
  }
  if (!response) {
    throw new AirDataError("Air quality service did not respond", "upstream");
  }
  if (!response.ok) {
    throw new AirDataError(`Air quality service returned ${response.status}`, "upstream");
  }
  return response.json();
}

export async function geocodeCity(city: string, fetcher: FetchLike = fetch): Promise<Place> {
  const url = new URL(GEOCODE_URL);
  url.searchParams.set("name", city);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");

  const parsed = geocodeSchema.safeParse(await getJson(url, fetcher));
  const hit = parsed.success ? parsed.data.results?.[0] : undefined;
  if (!hit) {
    throw new AirDataError(`We could not find "${city}". Try the English spelling, for example "Delhi".`, "not_found");
  }

  return {
    name: hit.name,
    region: hit.admin1 ?? "",
    country: hit.country ?? "",
    latitude: hit.latitude,
    longitude: hit.longitude,
    timezone: hit.timezone ?? "auto",
  };
}

const round1 = (n: number | null) => roundTo(n ?? 0);

/** Daily mean PM2.5 for each day after `today`, skipping missing hours. */
function buildOutlook(times: string[], pm25: (number | null)[], today: string): DailyOutlook[] {
  const byDay = new Map<string, number[]>();
  times.forEach((time, i) => {
    const date = time.slice(0, 10);
    const value = pm25[i];
    if (date <= today || value === null) return;
    byDay.set(date, [...(byDay.get(date) ?? []), value]);
  });
  return [...byDay.entries()]
    .filter(([, values]) => values.length >= 12) // ignore partial days at the end of the forecast
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
  url.searchParams.set("current", "us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone,carbon_monoxide");
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
    },
    next24h,
    outlook: buildOutlook(hourly.time, hourly.pm2_5, current.time.slice(0, 10)),
    source: "open-meteo",
  };
}
