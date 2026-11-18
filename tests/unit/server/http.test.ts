import { describe, expect, it } from "vitest";
import { z } from "zod";
import { clientKey, readJson } from "@/lib/server/http";

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

  it("uses the first x-forwarded-for address", () => {
    expect(clientKey(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip, then anonymous", () => {
    expect(clientKey(req({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientKey(req({}))).toBe("anonymous");
  });
});
