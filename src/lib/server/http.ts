import type { z } from "zod";
import { AirDataError } from "../air/open-meteo";

export const MAX_BODY_BYTES = 8 * 1024;

export function jsonError(status: number, message: string, headers?: HeadersInit): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

/**
 * Client address for rate limiting. Vercel sets `x-real-ip` itself; the first
 * `x-forwarded-for` hop is only a fallback for other hosts.
 */
export function clientKey(request: Request): string {
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/**
 * Blocks other websites from calling the API from their pages (which would
 * spend our Gemini quota). Requests without browser fetch metadata, such as
 * curl, are allowed and still rate limited.
 */
export function isCrossSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}

/** Maps air-data failures to a status; anything else is a 500 with a generic message. */
export function errorResponse(error: unknown, fallbackMessage: string): Response {
  if (error instanceof AirDataError) {
    return jsonError(error.kind === "not_found" ? 404 : 502, error.message);
  }
  console.error(fallbackMessage, error);
  return jsonError(500, fallbackMessage);
}

/**
 * Reads the body as text, stopping as soon as it passes `limit` bytes, so a
 * huge or chunked body is never held in memory. Returns null when too large.
 */
export async function readCapped(request: Request, limit: number): Promise<string | null> {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Reads a small JSON body and validates it. Rejects big or malformed bodies. */
export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<Parsed<z.infer<S>>> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return { ok: false, response: jsonError(415, "Send JSON") };
  }
  // Cheap early reject from the declared size, then a hard check on real bytes.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return { ok: false, response: jsonError(413, "Request too large") };

  const raw = await readCapped(request, MAX_BODY_BYTES);
  if (raw === null) return { ok: false, response: jsonError(413, "Request too large") };

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { ok: false, response: jsonError(400, "Invalid JSON") };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, response: jsonError(422, `${first.path.join(".") || "body"}: ${first.message}`) };
  }
  return { ok: true, data: parsed.data };
}
