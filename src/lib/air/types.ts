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
}

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

/** Hour of day (0-23) from a local `YYYY-MM-DDTHH:mm` string. */
export function hourOf(localTime: string): number {
  return Number.parseInt(localTime.slice(11, 13), 10);
}
