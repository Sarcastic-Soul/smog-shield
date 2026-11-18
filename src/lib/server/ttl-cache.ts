import { LruCache } from "./lru";

interface Entry<V> {
  promise: Promise<V>;
  expiresAt: number;
}

export interface TtlCache<V> {
  /** Returns the cached value, or runs `load` once and shares its promise. */
  get(key: string, load: () => Promise<V>, now?: number): Promise<V>;
  /** The live cached promise for `key`, without loading. */
  peek(key: string, now?: number): Promise<V> | undefined;
}

export interface TtlCacheOptions {
  ttlMs: number;
  max: number;
  /** Errors to keep (for example "city not found"), so repeats skip the upstream call. */
  cacheError?: (error: unknown) => boolean;
}

/**
 * Promise cache with expiry. Storing the promise (not the value) means two
 * requests for the same key at the same time trigger only one load. Failed
 * loads are evicted so the next request retries, unless `cacheError` keeps them.
 */
export function createTtlCache<V>({ ttlMs, max, cacheError }: TtlCacheOptions): TtlCache<V> {
  const store = new LruCache<Entry<V>>(max);

  const live = (key: string, now: number) => {
    const hit = store.get(key);
    return hit && hit.expiresAt > now ? hit : undefined;
  };

  return {
    peek(key, now = Date.now()) {
      return live(key, now)?.promise;
    },
    get(key, load, now = Date.now()) {
      const hit = live(key, now);
      if (hit) return hit.promise;

      const promise = load();
      const entry = { promise, expiresAt: now + ttlMs };
      store.set(key, entry);
      promise.catch((error: unknown) => {
        if (!cacheError?.(error) && store.get(key) === entry) store.delete(key);
      });
      return promise;
    },
  };
}
