import type { z } from "zod";

const MAX_BODY_BYTES = 8 * 1024;

export function jsonError(status: number, message: string, headers?: HeadersInit): Response {
  return Response.json({ error: message }, { status, headers });
}

/** Best-effort client address for rate limiting (Vercel sets x-forwarded-for). */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
}

type Parsed<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Reads a small JSON body and validates it. Rejects big or malformed bodies. */
export async function readJson<S extends z.ZodType>(request: Request, schema: S): Promise<Parsed<z.infer<S>>> {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return { ok: false, response: jsonError(415, "Send JSON") };
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return { ok: false, response: jsonError(413, "Request too large") };

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
