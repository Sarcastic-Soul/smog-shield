import { describe, expect, it } from "vitest";
import { ASK_SYSTEM_INSTRUCTION, PLAN_SYSTEM_INSTRUCTION } from "@/lib/ai/instructions";

describe("system instructions", () => {
  it("tell the model not to greet in answers", () => {
    expect(ASK_SYSTEM_INSTRUCTION).toMatch(/No greeting/);
  });

  it("ask for the day field and community actions in plans", () => {
    expect(PLAN_SYSTEM_INSTRUCTION).toMatch(/"day"/);
    expect(PLAN_SYSTEM_INSTRUCTION).toMatch(/Community actions/);
  });
});
