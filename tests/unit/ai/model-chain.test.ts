import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRetryable, orderModels, statusOf, withModelChain } from "@/lib/ai/model-chain";

const overloaded = Object.assign(new Error("UNAVAILABLE"), { status: 503 });
const options = { attemptTimeoutMs: 1000, retryDelayMs: 0 };
const never = new AbortController().signal;

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("isRetryable", () => {
  it("retries overload and quota statuses", () => {
    expect(isRetryable({ status: 503 })).toBe(true);
    expect(isRetryable({ status: 429 })).toBe(true);
  });

  it("retries known error text such as timeouts and aborts", () => {
    expect(isRetryable(new Error("UNAVAILABLE"))).toBe(true);
    expect(isRetryable(new Error("RESOURCE_EXHAUSTED"))).toBe(true);
    expect(isRetryable(new Error("This operation was aborted"))).toBe(true);
    expect(isRetryable(new Error("request timed out"))).toBe(true);
    expect(isRetryable(new Error("Timeout"))).toBe(true);
  });

  it("does not retry client errors or empty values", () => {
    expect(isRetryable({ status: 400 })).toBe(false);
    expect(isRetryable(new Error("bad request"))).toBe(false);
    expect(isRetryable(null)).toBe(false);
  });
});

describe("orderModels", () => {
  const defaults = ["a", "b", "c"] as const;

  it("keeps the defaults when nothing is preferred", () => {
    expect(orderModels(defaults)).toEqual(["a", "b", "c"]);
    expect(orderModels(defaults, "")).toEqual(["a", "b", "c"]);
  });

  it("puts the preferred model first without repeating it", () => {
    expect(orderModels(defaults, "c")).toEqual(["c", "a", "b"]);
  });

  it("adds an unknown preferred model in front", () => {
    expect(orderModels(defaults, "z")).toEqual(["z", "a", "b", "c"]);
  });

  it("does not change the defaults array", () => {
    orderModels(defaults, "c");
    expect(defaults).toEqual(["a", "b", "c"]);
  });
});

describe("withModelChain", () => {
  it("returns the first success and stops", async () => {
    const call = vi.fn(async (model: string) => `ok ${model}`);
    await expect(withModelChain(["a", "b"], never, call, options)).resolves.toBe("ok a");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("tries the next model after a retryable error", async () => {
    const call = vi.fn().mockRejectedValueOnce(overloaded).mockResolvedValueOnce("ok");
    await expect(withModelChain(["a", "b"], never, call, options)).resolves.toBe("ok");
    expect(call.mock.calls.map((c) => c[0])).toEqual(["a", "b"]);
  });

  it("throws the last error when every model is overloaded", async () => {
    const call = vi.fn().mockRejectedValue(overloaded);
    await expect(withModelChain(["a", "b", "c"], never, call, options)).rejects.toBe(overloaded);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it("stops at a non-retryable error", async () => {
    const hard = Object.assign(new Error("bad request"), { status: 400 });
    const call = vi.fn().mockRejectedValue(hard);
    await expect(withModelChain(["a", "b"], never, call, options)).rejects.toBe(hard);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("gives each attempt its own signal that follows the budget", async () => {
    const budget = new AbortController();
    let seen!: AbortSignal;
    await withModelChain(
      ["a"],
      budget.signal,
      async (_m, signal) => {
        seen = signal;
      },
      options,
    );
    expect(seen).not.toBe(budget.signal);
    expect(seen.aborted).toBe(false);
    budget.abort();
    expect(seen.aborted).toBe(true);
  });

  it("aborts an attempt after attemptTimeoutMs", async () => {
    let seen!: AbortSignal;
    await withModelChain(["a"], never, async (_m, signal) => void (seen = signal), { ...options, attemptTimeoutMs: 5 });
    await new Promise((r) => setTimeout(r, 20));
    expect(seen.aborted).toBe(true);
  });

  it("does not call any model when the budget is already spent", async () => {
    const budget = new AbortController();
    budget.abort();
    const call = vi.fn();
    await expect(withModelChain(["a"], budget.signal, call, options)).rejects.toThrow("No model available");
    expect(call).not.toHaveBeenCalled();
  });

  it("waits retryDelayMs before each later model, not before the first", async () => {
    vi.useFakeTimers();
    try {
      const call = vi.fn().mockRejectedValueOnce(overloaded).mockResolvedValueOnce("ok");
      const result = withModelChain(["a", "b"], never, call, { attemptTimeoutMs: 1000, retryDelayMs: 300 });
      await vi.advanceTimersByTimeAsync(0);
      expect(call).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(300);
      await expect(result).resolves.toBe("ok");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("statusOf", () => {
  it("reads a numeric status", () => {
    expect(statusOf({ status: 503 })).toBe(503);
  });

  it("returns undefined for no status, a non-numeric status or non-objects", () => {
    expect(statusOf(new Error("x"))).toBeUndefined();
    expect(statusOf({ status: "503" })).toBeUndefined();
    expect(statusOf(null)).toBeUndefined();
    expect(statusOf("503")).toBeUndefined();
  });
});
