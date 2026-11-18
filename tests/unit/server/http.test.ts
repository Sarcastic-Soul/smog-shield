import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AirDataError } from "@/lib/air/open-meteo";
import { clientKey, errorResponse, isCrossSite, jsonError, readJson } from "@/lib/server/http";

const schema = z.object({ n: z.number().min(1) }).strict();

const post = (body: string, contentType: string | null = "application/json") =>
  new Request("http://test.local/api", {
    method: "POST",
    body,
    headers: contentType ? { "content-type": contentType } : {},
  });

describe("readJson", () => {
  it("returns parsed data for a valid body", async () => {
    const result = await readJson(post('{"n":2}'), schema);
    expect(result).toEqual({ ok: true, data: { n: 2 } });
  });

  it("returns 415 without a JSON content type", async () => {
    const result = await readJson(post('{"n":2}', "text/plain"), schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(415);
  });

  it("returns 413 for a body over 8 KB", async () => {
    const result = await readJson(post(JSON.stringify({ n: 1, pad: "x".repeat(9000) })), schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("returns 413 early when content-length is over 8 KB", async () => {
    const request = new Request("http://test.local/api", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json", "content-length": "9000" },
    });
    const result = await readJson(request, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("returns 400 for malformed JSON", async () => {
    const result = await readJson(post("{nope"), schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });

  it("returns 422 with the field path when validation fails", async () => {
    const result = await readJson(post('{"n":0}'), schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(422);
      const body = (await result.response.json()) as { error: string };
      expect(body.error).toMatch(/^n:/);
    }
  });

  it("returns 422 for unknown keys", async () => {
    const result = await readJson(post('{"n":2,"extra":1}'), schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(422);
  });
});

describe("clientKey", () => {
  const req = (headers: Record<string, string>) => new Request("http://test.local", { headers });

  it("uses the first x-forwarded-for address when x-real-ip is missing", () => {
    expect(clientKey(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
  });

  it("prefers x-real-ip over x-forwarded-for", () => {
    expect(clientKey(req({ "x-real-ip": "3.3.3.3", "x-forwarded-for": "1.1.1.1" }))).toBe("3.3.3.3");
  });

  it("returns unknown when no address header is set", () => {
    expect(clientKey(req({}))).toBe("unknown");
    expect(clientKey(req({ "x-forwarded-for": "  " }))).toBe("unknown");
  });
});

describe("isCrossSite", () => {
  const req = (headers: Record<string, string>) => new Request("http://app.test/api/plan", { headers });

  it("allows same-origin and user-initiated fetch metadata", () => {
    expect(isCrossSite(req({ "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(isCrossSite(req({ "sec-fetch-site": "none" }))).toBe(false);
  });

  it("blocks same-site and cross-site fetch metadata", () => {
    expect(isCrossSite(req({ "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(isCrossSite(req({ "sec-fetch-site": "same-site" }))).toBe(true);
  });

  it("allows requests with no browser headers, such as curl", () => {
    expect(isCrossSite(req({}))).toBe(false);
  });

  it("compares the Origin host with the request host", () => {
    expect(isCrossSite(req({ origin: "http://app.test" }))).toBe(false);
    expect(isCrossSite(req({ origin: "https://evil.example" }))).toBe(true);
  });

  it("treats an unparseable Origin as cross-site", () => {
    expect(isCrossSite(req({ origin: "not a url" }))).toBe(true);
  });
});

describe("errorResponse", () => {
  it("maps not_found to 404 with the error message", async () => {
    const response = errorResponse(new AirDataError("no such city", "not_found"), "fallback");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "no such city" });
  });

  it("maps upstream failures to 502", () => {
    expect(errorResponse(new AirDataError("down", "upstream"), "fallback").status).toBe(502);
  });

  it("hides unexpected errors behind the fallback message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = errorResponse(new Error("secret detail"), "Something went wrong.");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Something went wrong." });
  });
});

describe("jsonError", () => {
  it("sets no-store and merges extra headers", () => {
    const response = jsonError(429, "slow down", { "Retry-After": "5" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("5");
  });
});
