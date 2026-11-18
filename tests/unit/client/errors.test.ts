import { describe, expect, it } from "vitest";
import { isAbortError, messageOf } from "@/lib/client/errors";

describe("isAbortError", () => {
  it("recognises a DOMException AbortError", () => {
    expect(isAbortError(new DOMException("stop", "AbortError"))).toBe(true);
  });

  it("does not match other DOMException names", () => {
    expect(isAbortError(new DOMException("slow", "TimeoutError"))).toBe(false);
  });

  it("recognises any error named AbortError", () => {
    expect(isAbortError(Object.assign(new Error("x"), { name: "AbortError" }))).toBe(true);
  });

  it("is false for normal errors and empty values", () => {
    expect(isAbortError(new Error("x"))).toBe(false);
    expect(isAbortError(null)).toBe(false);
    expect(isAbortError(undefined)).toBe(false);
    expect(isAbortError("AbortError")).toBe(false);
  });
});

describe("messageOf", () => {
  it("returns an Error's message", () => {
    expect(messageOf(new Error("It broke"))).toBe("It broke");
  });

  it("returns a generic message for anything else", () => {
    expect(messageOf("text")).toBe("Something went wrong.");
    expect(messageOf(null)).toBe("Something went wrong.");
  });
});
