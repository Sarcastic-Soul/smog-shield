import { describe, expect, it } from "vitest";
import { API_CSP, buildCsp } from "@/lib/server/csp";

const directive = (csp: string, name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";

describe("buildCsp", () => {
  it("puts the nonce in script-src with strict-dynamic", () => {
    const script = directive(buildCsp("abc123", false), "script-src");
    expect(script).toContain("'nonce-abc123'");
    expect(script).toContain("'strict-dynamic'");
  });

  it("never allows unsafe-inline or unsafe-eval for scripts in production", () => {
    const script = directive(buildCsp("n", false), "script-src");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("allows eval and websockets in development only", () => {
    const dev = buildCsp("n", true);
    const prod = buildCsp("n", false);
    expect(directive(dev, "script-src")).toContain("'unsafe-eval'");
    expect(directive(dev, "connect-src")).toContain("ws:");
    expect(directive(prod, "connect-src")).toBe("connect-src 'self'");
  });

  it("locks down framing, objects, base and forms", () => {
    const csp = buildCsp("n", false);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("keeps unsafe-inline for styles only", () => {
    const csp = buildCsp("n", false);
    expect(directive(csp, "style-src")).toContain("'unsafe-inline'");
    expect(csp.match(/'unsafe-inline'/g)).toHaveLength(1);
  });

  it("uses a different policy string for a different nonce", () => {
    expect(buildCsp("a", false)).not.toBe(buildCsp("b", false));
  });
});

describe("API_CSP", () => {
  it("blocks everything", () => {
    expect(API_CSP).toBe("default-src 'none'; frame-ancestors 'none'");
  });
});
