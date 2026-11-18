import { beforeEach, describe, expect, it, vi } from "vitest";
import { AirDataError } from "@/lib/air/open-meteo";
import type { Place } from "@/lib/air/types";
import { delhiReport, DELHI_PLACE } from "../../fixtures/delhi";

const geocodeCity = vi.fn();
const fetchAirReport = vi.fn();

vi.mock("@/lib/air/open-meteo", async () => {
  const actual = await vi.importActual<typeof import("@/lib/air/open-meteo")>("@/lib/air/open-meteo");
  return {
    ...actual,
    geocodeCity: (...args: unknown[]) => geocodeCity(...args),
    fetchAirReport: (...args: unknown[]) => fetchAirReport(...args),
  };
});

async function load() {
  vi.resetModules();
  return (await import("@/lib/server/air-service")).getAirReport;
}

const placeAt = (name: string, latitude: number, longitude: number): Place => ({
  ...DELHI_PLACE,
  name,
  latitude,
  longitude,
});

beforeEach(() => {
  geocodeCity.mockReset();
  fetchAirReport.mockReset();
  fetchAirReport.mockImplementation(async (place: Place) => ({ ...delhiReport(), place }));
});

describe("getAirReport", () => {
  it("geocodes the city and fetches the air report for its coordinates", async () => {
    geocodeCity.mockResolvedValue(DELHI_PLACE);
    const getAirReport = await load();
    const report = await getAirReport("New Delhi");
    expect(geocodeCity).toHaveBeenCalledWith("New Delhi");
    expect(fetchAirReport).toHaveBeenCalledWith(DELHI_PLACE);
    expect(report.place).toEqual(DELHI_PLACE);
  });

  it("trims and collapses spaces before geocoding", async () => {
    geocodeCity.mockResolvedValue(DELHI_PLACE);
    const getAirReport = await load();
    await getAirReport("  New    Delhi ");
    expect(geocodeCity).toHaveBeenCalledWith("New Delhi");
  });

  it("looks a city up once whatever its case or spacing", async () => {
    geocodeCity.mockResolvedValue(DELHI_PLACE);
    const getAirReport = await load();
    await getAirReport("New Delhi");
    await getAirReport(" new   DELHI ");
    expect(geocodeCity).toHaveBeenCalledTimes(1);
  });

  it("shares one air fetch between names that resolve to the same coordinates", async () => {
    geocodeCity.mockImplementation(async (name: string) => placeAt(name, 28.6358, 77.2245));
    const getAirReport = await load();
    const [a, b] = await Promise.all([getAirReport("Delhi"), getAirReport("New Delhi")]);
    expect(fetchAirReport).toHaveBeenCalledTimes(1);
    expect(a.place.name).toBe("Delhi");
    expect(b.place.name).toBe("New Delhi");
  });

  it("treats coordinates that round to the same 0.01 degrees as one place", async () => {
    geocodeCity.mockImplementation(async (name: string) => placeAt(name, name === "A" ? 28.6301 : 28.6349, 77.2201));
    const getAirReport = await load();
    await getAirReport("A");
    await getAirReport("B");
    expect(fetchAirReport).toHaveBeenCalledTimes(1);
  });

  it("fetches again for a different location", async () => {
    geocodeCity.mockImplementation(async (name: string) =>
      name === "Pune" ? placeAt("Pune", 18.52, 73.86) : DELHI_PLACE,
    );
    const getAirReport = await load();
    await getAirReport("Delhi");
    await getAirReport("Pune");
    expect(fetchAirReport).toHaveBeenCalledTimes(2);
  });

  it("caches a not-found city, so repeats do not call the geocoder", async () => {
    geocodeCity.mockRejectedValue(new AirDataError("not here", "not_found"));
    const getAirReport = await load();
    await expect(getAirReport("Atlantis")).rejects.toMatchObject({ kind: "not_found" });
    await expect(getAirReport("atlantis")).rejects.toMatchObject({ kind: "not_found" });
    expect(geocodeCity).toHaveBeenCalledTimes(1);
    expect(fetchAirReport).not.toHaveBeenCalled();
  });

  it("does not cache upstream geocoding failures", async () => {
    geocodeCity.mockRejectedValueOnce(new AirDataError("down", "upstream")).mockResolvedValueOnce(DELHI_PLACE);
    const getAirReport = await load();
    await expect(getAirReport("Delhi")).rejects.toMatchObject({ kind: "upstream" });
    await expect(getAirReport("Delhi")).resolves.toMatchObject({ source: "open-meteo" });
    expect(geocodeCity).toHaveBeenCalledTimes(2);
  });

  it("does not cache a failed air fetch", async () => {
    geocodeCity.mockResolvedValue(DELHI_PLACE);
    fetchAirReport.mockRejectedValueOnce(new AirDataError("down", "upstream"));
    const getAirReport = await load();
    await expect(getAirReport("Delhi")).rejects.toMatchObject({ kind: "upstream" });
    await expect(getAirReport("Delhi")).resolves.toMatchObject({ source: "open-meteo" });
    expect(fetchAirReport).toHaveBeenCalledTimes(2);
  });
});
