import { AirDataError } from "../air/fetch-json";
import type { AirReport, Place } from "../air/types";
import { createTtlCache } from "./ttl-cache";

export interface AirServiceDeps {
  geocode: (city: string) => Promise<Place>;
  fetchReport: (place: Place) => Promise<AirReport>;
}

export interface AirService {
  /** Air report for a city name as typed. Cache keys ignore case and extra spaces. */
  getAirReport(city: string): Promise<AirReport>;
}

/** City names rarely move, so geocoding (including "not found") is kept for a day. */
const PLACE_TTL_MS = 24 * 60 * 60_000;
/** Open-Meteo updates hourly; 10 minutes keeps us well inside its fair-use limits. */
const REPORT_TTL_MS = 10 * 60_000;

const isNotFound = (error: unknown) => error instanceof AirDataError && error.kind === "not_found";

/**
 * Cached air data. Reports are keyed by rounded coordinates, so "Delhi" and
 * "New Delhi" share one entry, and requests made at the same moment share one
 * upstream call.
 */
export function createAirService({ geocode, fetchReport }: AirServiceDeps): AirService {
  const places = createTtlCache<Place>({ ttlMs: PLACE_TTL_MS, max: 2000, cacheError: isNotFound });
  const reports = createTtlCache<AirReport>({ ttlMs: REPORT_TTL_MS, max: 500 });

  return {
    async getAirReport(city) {
      const name = city.trim().replace(/\s+/g, " ");
      const place = await places.get(name.toLowerCase(), () => geocode(name));
      const coordKey = `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`;
      const report = await reports.get(coordKey, () => fetchReport(place));
      // Keep the place this name resolved to, even when coordinates are shared.
      return report.place === place ? report : { ...report, place };
    },
  };
}
