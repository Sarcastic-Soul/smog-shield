import { describe, expect, it, vi } from "vitest";
import { ASK_BUDGET_MS, ATTEMPT_TIMEOUT_MS, PLAN_BUDGET_MS, RETRY_DELAY_MS } from "@/lib/ai/budgets";

// Importing the routes pulls in services.ts; keep it from building the real wiring.
vi.mock("@/lib/server/services", () => ({ assistant: null, planService: {}, planLimiter: {}, askLimiter: {} }));

describe("route durations", () => {
  it("lets the plan route run longer than the plan budget", async () => {
    const { maxDuration } = await import("@/app/api/plan/route");
    expect(maxDuration * 1000).toBeGreaterThan(PLAN_BUDGET_MS);
  });

  it("lets the ask route run longer than the answer budget", async () => {
    const { maxDuration } = await import("@/app/api/ask/route");
    expect(maxDuration * 1000).toBeGreaterThan(ASK_BUDGET_MS);
  });

  it("keeps one attempt inside the plan and answer budgets", () => {
    expect(ATTEMPT_TIMEOUT_MS + RETRY_DELAY_MS).toBeLessThan(Math.min(PLAN_BUDGET_MS, ASK_BUDGET_MS));
  });
});
