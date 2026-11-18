/** Rounds to a fixed number of decimal places (default 1). */
export function roundTo(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function mean(values: readonly number[]): number {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0;
}
