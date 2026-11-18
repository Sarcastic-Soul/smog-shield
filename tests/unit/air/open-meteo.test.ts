import { beforeEach, describe, expect, it, vi } from "vitest";
import { AirDataError, fetchAirReport, geocodeCity } from "@/lib/air/open-meteo";
import { airResponse, delhiReport, DELHI_PLACE, geocodeResponse } from "../../fixtures/delhi";

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

const jsonFetch = (body: unknown, status = 200) => vi.fn<typeof fetch>(async () => Response.json(body, { status }));

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

describe("outlook", () => {
  type Air = ReturnType<typeof airResponse>;
  const truncate = (data: Air, hours: number): Air => ({
    ...data,
    hourly: {
      time: data.hourly.time.slice(0, hours),
      us_aqi: data.hourly.us_aqi.slice(0, hours),
      pm2_5: data.hourly.pm2_5.slice(0, hours),
    },
  });

  it("asks for four forecast days", async () => {
    const fetcher = jsonFetch(airResponse());
    await fetchAirReport(DELHI_PLACE, fetcher);
    expect(new URL(String(fetcher.mock.calls[0][0])).searchParams.get("forecast_days")).toBe("4");
  });

  it("gives the daily mean PM2.5 and its AQI for the next three days, not today", async () => {
    const { outlook } = await fetchAirReport(DELHI_PLACE, jsonFetch(airResponse()));
    expect(outlook.map((d) => d.date)).toEqual(["2026-01-16", "2026-01-17", "2026-01-18"]);
    expect(outlook[0]).toEqual({ date: "2026-01-16", avgPm25: 88.6, aqi: 174 });
  });

  it("skips a last day that has fewer than 12 hours", async () => {
    const { outlook } = await fetchAirReport(DELHI_PLACE, jsonFetch(truncate(airResponse(), 72 + 11)));
    expect(outlook.map((d) => d.date)).toEqual(["2026-01-16", "2026-01-17"]);
  });

  it("keeps a last day that has exactly 12 hours", async () => {
    const { outlook } = await fetchAirReport(DELHI_PLACE, jsonFetch(truncate(airResponse(), 72 + 12)));
    expect(outlook.map((d) => d.date)).toHaveLength(3);
  });

  it("is empty when the forecast ends today", async () => {
    const { outlook } = await fetchAirReport(DELHI_PLACE, jsonFetch(truncate(airResponse(), 24)));
    expect(outlook).toEqual([]);
  });

  it("ignores null PM2.5 hours when averaging and drops a day left with too few", async () => {
    const data = airResponse();
    const pm = data.hourly.pm2_5 as (number | null)[];
    for (let i = 24; i < 24 + 13; i++) pm[i] = null; // 11 hours left on 2026-01-16
    for (let i = 48; i < 48 + 2; i++) pm[i] = null; // 22 hours left on 2026-01-17
    const { outlook } = await fetchAirReport(DELHI_PLACE, jsonFetch(data));
    expect(outlook.map((d) => d.date)).toEqual(["2026-01-17", "2026-01-18"]);
    expect(outlook[0].avgPm25).toBeGreaterThan(0);
  });
});

describe("upstream errors", () => {
  it("suggests the English spelling when a city is not found", async () => {
    const error = await geocodeCity("दिल्ली", jsonFetch({})).catch((e) => e);
    expect(error.message).toContain("English spelling");
  });

  it("recovers when a 503 is followed by a good answer", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({}, { status: 503 }))
      .mockResolvedValueOnce(Response.json(airResponse()));
    await expect(fetchAirReport(DELHI_PLACE, fetcher)).resolves.toMatchObject({ source: "open-meteo" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 4xx", async () => {
    const fetcher = jsonFetch({}, 429);
    await expect(fetchAirReport(DELHI_PLACE, fetcher)).rejects.toMatchObject({ kind: "upstream" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails after two dropped connections", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("socket hang up"));
    await expect(fetchAirReport(DELHI_PLACE, fetcher)).rejects.toMatchObject({
      message: "Air quality service did not respond",
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
