import "server-only";
import { fetchAirReport, geocodeCity } from "../air/open-meteo";
import type { AirReport } from "../air/types";
import { createTtlCache } from "./ttl-cache";

/**
 * Air data per city, cached for 10 minutes. Open-Meteo updates hourly, so this
 * keeps us well inside their fair-use limits and makes repeat lookups instant.
 * Requests for the same city made at the same moment share one upstream call.
 */
const cache = createTtlCache<AirReport>({ ttlMs: 10 * 60_000, max: 500 });

export function getAirReport(cityKey: string): Promise<AirReport> {
  return cache.get(cityKey, async () => fetchAirReport(await geocodeCity(cityKey)));
}

export function normaliseCity(city: string): string {
  return city.trim().toLowerCase().replace(/\s+/g, " ");
}
