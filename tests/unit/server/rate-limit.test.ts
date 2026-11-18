import { describe, expect, it } from "vitest";
import { createRateLimiter } from "@/lib/server/rate-limit";

describe("createRateLimiter", () => {
  it("allows requests up to the limit", () => {
    const limiter = createRateLimiter(3, 1000);
    expect([limiter.check("a", 0), limiter.check("a", 1), limiter.check("a", 2)]).toEqual([0, 0, 0]);
  });

  it("blocks the next request and returns seconds to wait", () => {
    const limiter = createRateLimiter(2, 60_000);
    limiter.check("a", 0);
    limiter.check("a", 0);
    expect(limiter.check("a", 10_000)).toBe(50);
  });

  it("rounds the wait up to a whole second", () => {
    const limiter = createRateLimiter(1, 1000);
    limiter.check("a", 0);
    expect(limiter.check("a", 1)).toBe(1);
  });

  it("allows again after the window ends", () => {
    const limiter = createRateLimiter(1, 1000);
    limiter.check("a", 0);
    expect(limiter.check("a", 500)).toBeGreaterThan(0);
    expect(limiter.check("a", 1000)).toBe(0);
  });

  it("counts each key separately", () => {
    const limiter = createRateLimiter(1, 1000);
    limiter.check("a", 0);
    expect(limiter.check("b", 0)).toBe(0);
    expect(limiter.check("a", 0)).toBeGreaterThan(0);
  });

  it("evicts the oldest key when full, so memory stays bounded", () => {
    const limiter = createRateLimiter(1, 1000, 2);
    limiter.check("a", 0);
    limiter.check("b", 0);
    limiter.check("c", 0); // evicts "a"
    expect(limiter.check("a", 0)).toBe(0); // "a" starts fresh
    expect(limiter.check("c", 0)).toBeGreaterThan(0);
  });

  it("drops expired keys before evicting live ones", () => {
    const limiter = createRateLimiter(1, 1000, 2);
    limiter.check("a", 0);
    limiter.check("b", 900);
    limiter.check("c", 1500); // "a" expired and is dropped; "b" stays
    expect(limiter.check("b", 1500)).toBeGreaterThan(0);
  });
});
