import { LruCache } from "./lru";

interface Entry<V> {
  promise: Promise<V>;
  expiresAt: number;
}

export interface TtlCache<V> {
  /** Returns the cached value, or runs `load` once and shares its promise. */
  get(key: string, load: () => Promise<V>, now?: number): Promise<V>;
}

/**
 * Promise cache with expiry. Storing the promise (not the value) means two
 * requests for the same key at the same time trigger only one load. Failed
 * loads are evicted so the next request retries.
 */
export function createTtlCache<V>({ ttlMs, max }: { ttlMs: number; max: number }): TtlCache<V> {
  const store = new LruCache<Entry<V>>(max);

  return {
    get(key, load, now = Date.now()) {
      const hit = store.get(key);
      if (hit && hit.expiresAt > now) return hit.promise;

      const promise = load();
      const entry = { promise, expiresAt: now + ttlMs };
      store.set(key, entry);
      promise.catch(() => {
        if (store.get(key) === entry) store.delete(key);
      });
      return promise;
    },
  };
}
