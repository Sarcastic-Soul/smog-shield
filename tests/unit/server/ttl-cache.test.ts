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
