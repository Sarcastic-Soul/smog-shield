import { beforeEach, describe, expect, it, vi } from "vitest";
import { AirDataError } from "@/lib/air/fetch-json";
import { geocodeCity } from "@/lib/air/geocode";
import { DELHI_PLACE, geocodeResponse } from "../../fixtures/delhi";

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

describe("geocodeCity wiring", () => {
  it("asks the geocoding API in English for a single hit", async () => {
    const fetcher = jsonFetch(geocodeResponse);
    await geocodeCity("Pune", fetcher);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.origin).toBe("https://geocoding-api.open-meteo.com");
    expect(url.searchParams.get("language")).toBe("en");
    expect(url.searchParams.get("name")).toBe("Pune");
  });

  it("suggests the English spelling when a city is not found", async () => {
    const error = await geocodeCity("दिल्ली", jsonFetch({})).catch((e) => e);
    expect(error.message).toContain("English spelling");
  });

  it("treats a malformed response as not found", async () => {
    await expect(geocodeCity("x", jsonFetch({ results: [{ name: 1 }] }))).rejects.toMatchObject({ kind: "not_found" });
  });
});
