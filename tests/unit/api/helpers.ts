import { makeProfile } from "../../fixtures/profiles";

let counter = 0;

/** A unique client address per call, so rate-limit counters never leak between tests. */
export function freshIp(): string {
  counter += 1;
  return `10.0.${Math.floor(counter / 250)}.${counter % 250}`;
}

export function jsonRequest(url: string, body: unknown, ip = freshIp()): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

export const validProfile = () => makeProfile();
