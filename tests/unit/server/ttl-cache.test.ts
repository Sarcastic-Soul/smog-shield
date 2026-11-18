import { describe, expect, it, vi } from "vitest";
import { createTtlCache } from "@/lib/server/ttl-cache";

describe("createTtlCache", () => {
  it("shares one load between calls made at the same time", async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, max: 10 });
    const load = vi.fn(async () => 42);
    const [a, b] = await Promise.all([cache.get("k", load, 0), cache.get("k", load, 0)]);
    expect([a, b]).toEqual([42, 42]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads after the entry expires", async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, max: 10 });
    const load = vi.fn(async () => 1);
    await cache.get("k", load, 0);
    await cache.get("k", load, 999);
    await cache.get("k", load, 1000);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("forgets failed loads so the next call retries", async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, max: 10 });
    const load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(7);
    await expect(cache.get("k", load, 0)).rejects.toThrow("down");
    await expect(cache.get("k", load, 1)).resolves.toBe(7);
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("peek", () => {
  it("returns undefined for an unknown key and does not load", () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, max: 10 });
    expect(cache.peek("k", 0)).toBeUndefined();
  });

  it("returns the live promise until the entry expires", async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, max: 10 });
    await cache.get("k", async () => 5, 0);
    await expect(cache.peek("k", 999)).resolves.toBe(5);
    expect(cache.peek("k", 1000)).toBeUndefined();
  });

  it("sees a load that is still running", async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, max: 10 });
    let finish!: (n: number) => void;
    const pending = cache.get("k", () => new Promise<number>((resolve) => (finish = resolve)), 0);
    expect(cache.peek("k", 1)).toBe(pending);
    finish(3);
    await expect(pending).resolves.toBe(3);
  });
});

describe("cacheError", () => {
  class NotFound extends Error {}

  it("keeps errors the predicate accepts, so the upstream is not called again", async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, max: 10, cacheError: (e) => e instanceof NotFound });
    const load = vi.fn().mockRejectedValue(new NotFound("nope"));
    await expect(cache.get("k", load, 0)).rejects.toThrow("nope");
    await expect(cache.get("k", load, 10)).rejects.toThrow("nope");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("still evicts other errors", async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, max: 10, cacheError: (e) => e instanceof NotFound });
    const load = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(1);
    await expect(cache.get("k", load, 0)).rejects.toThrow("down");
    await expect(cache.get("k", load, 1)).resolves.toBe(1);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("drops a kept error when it expires", async () => {
    const cache = createTtlCache<number>({ ttlMs: 1000, max: 10, cacheError: () => true });
    const load = vi.fn().mockRejectedValueOnce(new NotFound("x")).mockResolvedValueOnce(2);
    await expect(cache.get("k", load, 0)).rejects.toThrow("x");
    await expect(cache.get("k", load, 1000)).resolves.toBe(2);
  });
});
