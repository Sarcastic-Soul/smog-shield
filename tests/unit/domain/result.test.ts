import { describe, expect, it } from "vitest";
import { isPlanEvent } from "@/lib/domain/result";
import { planResultFixture } from "../../fixtures/results";

describe("isPlanEvent", () => {
  it.each(["draft", "final"])("accepts a %s event", (kind) => {
    expect(isPlanEvent({ kind, result: planResultFixture() })).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "final"],
    ["no kind", { result: {} }],
    ["no result", { kind: "final" }],
    ["an unknown kind", { kind: "other", result: {} }],
    ["a null result", { kind: "final", result: null }],
    ["a non-object result", { kind: "final", result: 5 }],
  ])("rejects %s", (_name, value) => {
    expect(isPlanEvent(value)).toBe(false);
  });
});
