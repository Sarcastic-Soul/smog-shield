export interface CircuitBreaker {
  /** True while calls should be skipped. */
  isOpen(now?: number): boolean;
  /** Records one call; enough failures in a row open the breaker. */
  record(ok: boolean, now?: number): void;
  reset(): void;
}

/**
 * Stops sending work to a service that keeps failing, so users get the
 * fallback straight away instead of waiting for another timeout.
 */
export function createCircuitBreaker({
  threshold,
  cooldownMs,
}: {
  threshold: number;
  cooldownMs: number;
}): CircuitBreaker {
  let failures = 0;
  let openUntil = 0;
  return {
    isOpen: (now = Date.now()) => now < openUntil,
    record(ok, now = Date.now()) {
      if (ok) {
        failures = 0;
        return;
      }
      failures += 1;
      if (failures >= threshold) {
        openUntil = now + cooldownMs;
        failures = 0;
      }
    },
    reset() {
      failures = 0;
      openUntil = 0;
    },
  };
}
