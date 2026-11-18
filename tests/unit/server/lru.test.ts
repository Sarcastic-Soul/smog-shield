import { describe, expect, it } from "vitest";
import { LruCache } from "@/lib/server/lru";

describe("LruCache", () => {
  it("returns undefined for a missing key", () => {
    expect(new LruCache<number>(2).get("x")).toBeUndefined();
  });

  it("stores and returns values", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
  });

  it("evicts the least recently used entry past capacity", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.size).toBe(2);
  });

  it("treats a read as a use", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.get("a");
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
  });

  it("overwrites an existing key without growing", () => {
    const cache = new LruCache<number>(2);
    cache.set("a", 1);
    cache.set("a", 9);
    expect(cache.size).toBe(1);
    expect(cache.get("a")).toBe(9);
  });
});
