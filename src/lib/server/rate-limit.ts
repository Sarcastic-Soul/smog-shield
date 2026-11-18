/**
 * Fixed-window rate limiter kept in memory. On serverless hosts each instance
 * has its own counters, which is fine as a first line of defence against
 * someone hammering the AI endpoints from one address.
 */
export interface RateLimiter {
  /** Returns seconds to wait, or 0 when the request is allowed. */
  check(key: string, now?: number): number;
}

export function createRateLimiter(limit: number, windowMs: number, maxKeys = 5000): RateLimiter {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key, now = Date.now()) {
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        if (hits.size >= maxKeys) {
          // Drop expired entries first; if still full, drop the oldest key.
          for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
          if (hits.size >= maxKeys) hits.delete(hits.keys().next().value as string);
        }
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return 0;
      }
      if (entry.count >= limit) return Math.ceil((entry.resetAt - now) / 1000);
      entry.count += 1;
      return 0;
    },
  };
}
