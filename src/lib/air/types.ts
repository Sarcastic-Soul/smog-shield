export interface Place {
  name: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface AirNow {
  /** Local time at the place, `YYYY-MM-DDTHH:mm`. */
  time: string;
  aqi: number;
  pm25: number;
  pm10: number;
  no2: number;
  ozone: number;
  /** Carbon monoxide, µg/m³. */
  co: number;
  /** The pollutant driving the AQI right now. */
  dominant: Pollutant;
}

export type Pollutant = "pm25" | "pm10" | "no2" | "ozone" | "co" | "so2";

export const POLLUTANT_LABELS: Record<Pollutant, string> = {
  pm25: "PM2.5",
  pm10: "PM10",
  no2: "NO₂",
  ozone: "ozone",
  co: "carbon monoxide",
  so2: "SO₂",
};

export interface HourlyAir {
  /** Local time at the place, `YYYY-MM-DDTHH:mm`. */
  time: string;
  aqi: number;
  pm25: number;
}

/** Daily mean PM2.5 for a coming day, to spot multi-day smog episodes. */
export interface DailyOutlook {
  /** Local date, `YYYY-MM-DD`. */
  date: string;
  avgPm25: number;
  /** AQI of the daily mean PM2.5. */
  aqi: number;
}

export interface AirReport {
  place: Place;
  now: AirNow;
  /** The next 24 hours, starting at the current hour. */
  next24h: HourlyAir[];
  /** The next three calendar days after today. */
  outlook: DailyOutlook[];
  source: "open-meteo";
}

/*
 * Local times from Open-Meteo are `YYYY-MM-DDTHH:mm` strings with no offset.
 * These helpers are the only place that knows that layout.
 */

/** Hour of day (0-23). */
export function hourOf(localTime: string): number {
  return Number.parseInt(localTime.slice(11, 13), 10);
}

/** Calendar date, `YYYY-MM-DD`. */
export function dateOf(localTime: string): string {
  return localTime.slice(0, 10);
}

/** Clock time, `HH:mm`. */
export function clockOf(localTime: string): string {
  return localTime.slice(11, 16);
}

/** Minutes since midnight for an `HH:mm` clock string. */
export function minutesOfClock(clock: string): number {
  const [hours, minutes] = clock.split(":").map(Number);
  return hours * 60 + minutes;
}
