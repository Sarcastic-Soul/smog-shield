import { describe, expect, it } from "vitest";
import { createCircuitBreaker } from "@/lib/ai/circuit-breaker";

const make = () => createCircuitBreaker({ threshold: 3, cooldownMs: 1000 });

describe("createCircuitBreaker", () => {
  it("starts closed", () => {
    expect(make().isOpen(0)).toBe(false);
  });

  it("opens after threshold failures in a row", () => {
    const b = make();
    b.record(false, 0);
    b.record(false, 0);
    expect(b.isOpen(0)).toBe(false);
    b.record(false, 0);
    expect(b.isOpen(0)).toBe(true);
    expect(b.isOpen(999)).toBe(true);
  });

  it("closes after the cooldown", () => {
    const b = make();
    for (let i = 0; i < 3; i++) b.record(false, 100);
    expect(b.isOpen(1099)).toBe(true);
    expect(b.isOpen(1100)).toBe(false);
  });

  it("a success resets the failure streak", () => {
    const b = make();
    b.record(false, 0);
    b.record(false, 0);
    b.record(true, 0);
    b.record(false, 0);
    b.record(false, 0);
    expect(b.isOpen(0)).toBe(false);
  });

  it("starts a fresh streak after opening", () => {
    const b = make();
    for (let i = 0; i < 3; i++) b.record(false, 0);
    b.record(false, 2000);
    b.record(false, 2000);
    expect(b.isOpen(2000)).toBe(false);
    b.record(false, 2000);
    expect(b.isOpen(2000)).toBe(true);
  });

  it("reset closes an open breaker and clears the streak", () => {
    const b = make();
    for (let i = 0; i < 3; i++) b.record(false, 0);
    b.reset();
    expect(b.isOpen(0)).toBe(false);
    b.record(false, 0);
    b.record(false, 0);
    expect(b.isOpen(0)).toBe(false);
  });

  it("uses the real clock by default", () => {
    const b = createCircuitBreaker({ threshold: 1, cooldownMs: 60_000 });
    b.record(false);
    expect(b.isOpen()).toBe(true);
  });
});
