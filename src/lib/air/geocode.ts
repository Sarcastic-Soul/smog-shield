import { z } from "zod";
import { AirDataError, getJson, type FetchLike } from "./fetch-json";
import type { Place } from "./types";

/** Turns a city name into coordinates with the free Open-Meteo geocoder. */

const GEOCODE_URL = "https://geocoding-api.open-meteo.com/v1/search";

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
