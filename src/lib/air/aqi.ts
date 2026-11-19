import { roundTo } from "@/lib/math";

/**
 * US EPA AQI bands. Open-Meteo returns the US AQI, so we use the same scale
 * everywhere to keep the numbers comparable.
 */
export type AqiBandId = "good" | "moderate" | "sensitive" | "unhealthy" | "very_unhealthy" | "hazardous";

export interface AqiBand {
  id: AqiBandId;
  label: string;
  min: number;
  max: number;
  /** CSS custom property that holds the band colour. */
  colorVar: string;
}

const HAZARDOUS_BAND: AqiBand = {
  id: "hazardous",
  label: "Hazardous",
  min: 301,
  max: Number.POSITIVE_INFINITY,
  colorVar: "--aqi-hazardous",
};

export const AQI_BANDS: readonly AqiBand[] = [
  { id: "good", label: "Good", min: 0, max: 50, colorVar: "--aqi-good" },
  { id: "moderate", label: "Moderate", min: 51, max: 100, colorVar: "--aqi-moderate" },
  { id: "sensitive", label: "Unhealthy for sensitive groups", min: 101, max: 150, colorVar: "--aqi-sensitive" },
  { id: "unhealthy", label: "Unhealthy", min: 151, max: 200, colorVar: "--aqi-unhealthy" },
  { id: "very_unhealthy", label: "Very unhealthy", min: 201, max: 300, colorVar: "--aqi-very-unhealthy" },
  HAZARDOUS_BAND,
];

export function bandFor(aqi: number): AqiBand {
  const value = Math.max(0, Math.round(aqi));
  return AQI_BANDS.find((band) => value <= band.max) ?? HAZARDOUS_BAND;
}

/** WHO 2021 guideline for 24-hour mean PM2.5, in µg/m³. */
export const WHO_PM25_24H = 15;

/**
 * Berkeley Earth rule of thumb: breathing 22 µg/m³ of PM2.5 for a day is
 * about as harmful as smoking one cigarette.
 */
export const PM25_PER_CIGARETTE = 22;

export function cigarettesPerDay(pm25: number): number {
  return Math.max(0, roundTo(pm25 / PM25_PER_CIGARETTE));
}

export function timesWhoLimit(pm25: number): number {
  return Math.max(0, roundTo(pm25 / WHO_PM25_24H));
}

/** US EPA PM2.5 breakpoints (2024 revision): [concLow, concHigh, aqiLow, aqiHigh]. */
type Breakpoint = readonly [cLow: number, cHigh: number, aqiLow: number, aqiHigh: number];

const TOP_BREAKPOINT: Breakpoint = [225.5, 325.4, 301, 500];

const PM25_BREAKPOINTS: readonly Breakpoint[] = [
  [0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  TOP_BREAKPOINT,
];

/**
 * AQI for a single PM2.5 reading. The official US AQI averages 24 hours; this
 * hourly version shows when in the day the air is cleaner or dirtier.
 */
export function pm25ToAqi(pm25: number): number {
  const c = Math.max(0, Math.floor(pm25 * 10) / 10);
  const row = PM25_BREAKPOINTS.find(([, high]) => c <= high) ?? TOP_BREAKPOINT;
  const [cLow, cHigh, aLow, aHigh] = row;
  return Math.min(500, Math.round(((aHigh - aLow) / (cHigh - cLow)) * (Math.min(c, cHigh) - cLow) + aLow));
}
