import "server-only";
import { AirDataError, fetchAirReport, geocodeCity } from "../air/open-meteo";
import type { AirReport, Place } from "../air/types";
import { createTtlCache } from "./ttl-cache";

const isNotFound = (error: unknown) => error instanceof AirDataError && error.kind === "not_found";

/** City names rarely move, so geocoding (including "not found") is kept for a day. */
const places = createTtlCache<Place>({ ttlMs: 24 * 60 * 60_000, max: 2000, cacheError: isNotFound });

/**
 * Air data is keyed by rounded coordinates, so "Delhi" and "New Delhi" share
 * one entry. Open-Meteo updates hourly; 10 minutes keeps us well inside their
 * fair-use limits. Requests made at the same moment share one upstream call.
 */
const reports = createTtlCache<AirReport>({ ttlMs: 10 * 60_000, max: 500 });

/** Air report for a city name as typed. Cache keys ignore case and extra spaces. */
export async function getAirReport(city: string): Promise<AirReport> {
  const name = city.trim().replace(/\s+/g, " ");
  const place = await places.get(name.toLowerCase(), () => geocodeCity(name));
  const coordKey = `${place.latitude.toFixed(2)},${place.longitude.toFixed(2)}`;
  const report = await reports.get(coordKey, () => fetchAirReport(place));
  // Keep the name the user typed resolved to, even when coordinates are shared.
  return report.place === place ? report : { ...report, place };
}
