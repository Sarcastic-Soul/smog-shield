import { describe, expect, it, vi } from "vitest";
import { AirDataError, fetchAirReport, geocodeCity } from "@/lib/air/open-meteo";
import { airResponse, delhiReport, DELHI_PLACE, geocodeResponse } from "../../fixtures/delhi";

const jsonFetch = (body: unknown, status = 200) =>
  vi.fn<typeof fetch>(async () => Response.json(body, { status }));

describe("geocodeCity", () => {
  it("maps the first hit to a Place", async () => {
    const fetcher = jsonFetch(geocodeResponse);
    await expect(geocodeCity("New Delhi", fetcher)).resolves.toEqual(DELHI_PLACE);
    const url = String(fetcher.mock.calls[0][0]);
    expect(url).toContain("name=New+Delhi");
    expect(url).toContain("count=1");
  });

  it("throws not_found when there are no results", async () => {
    await expect(geocodeCity("Nowhereville", jsonFetch({}))).rejects.toMatchObject({
      name: "AirDataError",
      kind: "not_found",
    });
  });

  it("throws not_found when results is an empty list", async () => {
    await expect(geocodeCity("x", jsonFetch({ results: [] }))).rejects.toMatchObject({ kind: "not_found" });
  });

  it("throws upstream on a 500", async () => {
    const error = await geocodeCity("Delhi", jsonFetch({}, 500)).catch((e) => e);
    expect(error).toBeInstanceOf(AirDataError);
    expect(error.kind).toBe("upstream");
    expect(error.message).toContain("500");
  });

  it("throws upstream when fetch itself fails", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network down"));
    await expect(geocodeCity("Delhi", fetcher)).rejects.toMatchObject({ kind: "upstream" });
  });

  it("fills blanks for missing optional fields", async () => {
    const body = { results: [{ name: "Smalltown", latitude: 1, longitude: 2 }] };
    await expect(geocodeCity("Smalltown", jsonFetch(body))).resolves.toMatchObject({
      region: "",
      country: "",
      timezone: "auto",
    });
  });
});

describe("fetchAirReport", () => {
  it("parses the fixture into an AirReport", async () => {
    const report = await fetchAirReport(DELHI_PLACE, jsonFetch(airResponse()));
    expect(report).toEqual(delhiReport());
  });

  it("starts next24h at the current hour and covers 24 hours", async () => {
    const report = await fetchAirReport(DELHI_PLACE, jsonFetch(airResponse()));
    expect(report.next24h).toHaveLength(24);
    expect(report.next24h[0].time).toBe("2026-01-15T10:00");
    expect(report.next24h[23].time).toBe("2026-01-16T09:00");
  });

  it("skips hours with a null AQI", async () => {
    const data = airResponse();
    const index = data.hourly.time.indexOf("2026-01-15T12:00");
    (data.hourly.us_aqi as (number | null)[])[index] = null;
    const report = await fetchAirReport(DELHI_PLACE, jsonFetch(data));
    expect(report.next24h.map((h) => h.time)).not.toContain("2026-01-15T12:00");
    expect(report.next24h).toHaveLength(24);
  });

  it("rounds AQI to a whole number and concentrations to one decimal", async () => {
    const data = airResponse();
    data.current.us_aqi = 118.6;
    data.current.pm10 = 140.26;
    const { now } = await fetchAirReport(DELHI_PLACE, jsonFetch(data));
    expect(now.aqi).toBe(119);
    expect(now.pm10).toBe(140.3);
  });

  it("falls back to the first forecast AQI when current AQI is null", async () => {
    const data = airResponse();
    (data.current as { us_aqi: number | null }).us_aqi = null;
    const { now, next24h } = await fetchAirReport(DELHI_PLACE, jsonFetch(data));
    expect(now.aqi).toBe(next24h[0].aqi);
  });

  it("throws upstream when the payload is incomplete", async () => {
    await expect(fetchAirReport(DELHI_PLACE, jsonFetch({ current: {} }))).rejects.toMatchObject({
      kind: "upstream",
    });
  });

  it("throws upstream on a 500", async () => {
    await expect(fetchAirReport(DELHI_PLACE, jsonFetch({}, 500))).rejects.toMatchObject({ kind: "upstream" });
  });

  it("asks for a rounded latitude and longitude", async () => {
    const fetcher = jsonFetch(airResponse());
    await fetchAirReport(DELHI_PLACE, fetcher);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.searchParams.get("latitude")).toBe("28.636");
    expect(url.searchParams.get("longitude")).toBe("77.225");
  });
});

describe("upstream retry", () => {
  it("retries once after a dropped connection", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("socket hang up"))
      .mockResolvedValueOnce(Response.json(geocodeResponse));
    await expect(geocodeCity("New Delhi", fetcher)).resolves.toEqual(DELHI_PLACE);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("retries once after a 5xx, then reports the status", async () => {
    const fetcher = jsonFetch({}, 503);
    await expect(geocodeCity("Delhi", fetcher)).rejects.toMatchObject({ kind: "upstream" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
