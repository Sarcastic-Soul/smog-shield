import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AirDataError } from "@/lib/air/fetch-json";
import {
  clientKey,
  errorResponse,
  guardRequest,
  isCrossSite,
  jsonError,
  readCapped,
  readJson,
  streamText,
} from "@/lib/server/http";
import type { RateLimiter } from "@/lib/server/rate-limit";

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

describe("readCapped", () => {
  const encoder = new TextEncoder();
  const streamed = (chunks: string[], onCancel?: () => void) =>
    new Request("http://test.local/api", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
        cancel: onCancel,
      }),
      // @ts-expect-error Node requires duplex for stream bodies.
      duplex: "half",
    });

  it("joins chunks into text when under the limit", async () => {
    await expect(readCapped(streamed(["hel", "lo ", "wörld"]), 100)).resolves.toBe("hello wörld");
  });

  it("allows a body of exactly the limit", async () => {
    await expect(readCapped(streamed(["abcd", "efgh"]), 8)).resolves.toBe("abcdefgh");
  });

  it("returns null as soon as a chunked body passes the limit, and cancels the stream", async () => {
    let pulled = 0;
    const request = new Request("http://test.local/api", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled += 1;
          controller.enqueue(encoder.encode("x".repeat(10)));
        },
      }),
      // @ts-expect-error Node requires duplex for stream bodies.
      duplex: "half",
    });
    await expect(readCapped(request, 25)).resolves.toBeNull();
    // Endless source: reading stopped after a few chunks.
    expect(pulled).toBeLessThan(20);
  });

  it("returns an empty string when there is no body", async () => {
    await expect(readCapped(new Request("http://test.local/api"), 10)).resolves.toBe("");
  });

  it("makes readJson answer 413 for a chunked body over 8 KB without a content-length", async () => {
    const request = new Request("http://test.local/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < 5; i++) controller.enqueue(encoder.encode("x".repeat(2000)));
          controller.close();
        },
      }),
      // @ts-expect-error Node requires duplex for stream bodies.
      duplex: "half",
    });
    const result = await readJson(request, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });
});

describe("guardRequest", () => {
  const schema = z.object({ a: z.number() }).strict();
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request("http://test.local/x", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "9.9.9.9", ...headers },
      body: JSON.stringify(body),
    });
  const limiter = (wait: number) => ({ check: () => wait }) as unknown as RateLimiter;

  it("returns the parsed body when every check passes", async () => {
    await expect(guardRequest(post({ a: 1 }), limiter(0), schema)).resolves.toEqual({ ok: true, data: { a: 1 } });
  });

  it("refuses a cross-site request with 403 before touching the limiter", async () => {
    const check = vi.fn(() => 0);
    const result = await guardRequest(post({ a: 1 }, { "sec-fetch-site": "cross-site" }), { check } as never, schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
    expect(check).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when the limiter says wait", async () => {
    const result = await guardRequest(post({ a: 1 }), limiter(7), schema);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(429);
      expect(result.response.headers.get("Retry-After")).toBe("7");
    }
  });

  it("returns 422 for a body that fails the schema", async () => {
    const result = await guardRequest(post({ a: "x" }), limiter(0), schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(422);
  });
});

describe("streamText", () => {
  async function* chunks(...parts: string[]) {
    yield* parts;
  }

  it("streams the chunks with the content type and no caching", async () => {
    const response = streamText(chunks("a", "b"), "text/plain");
    expect(response.headers.get("Content-Type")).toBe("text/plain");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("ab");
  });

  it("adds the last chunk from onError when the source fails", async () => {
    const source = (async function* () {
      yield "Partial ";
      throw new Error("cut");
    })();
    const onError = vi.fn(() => "[sorry]");
    expect(await streamText(source, "text/plain", onError).text()).toBe("Partial [sorry]");
    expect(onError).toHaveBeenCalledOnce();
  });

  it("closes quietly on failure when onError returns nothing", async () => {
    const source = (async function* () {
      yield "x";
      throw new Error("cut");
    })();
    expect(await streamText(source, "text/plain").text()).toBe("x");
  });
});
