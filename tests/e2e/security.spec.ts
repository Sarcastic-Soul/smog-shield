import { expect, test } from "@playwright/test";

function directive(csp: string, name: string): string {
  return (
    csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `)) ?? ""
  );
}

test.describe("content security policy", () => {
  test("the page response has a CSP header with a nonce and no unsafe-inline in script-src", async ({ page }) => {
    const response = await page.goto("/");
    const csp = response!.headers()["content-security-policy"];
    expect(csp, "CSP header present").toBeTruthy();

    const script = directive(csp, "script-src");
    expect(script).toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  test("each page request gets a fresh nonce", async ({ request }) => {
    const nonceOf = async () => {
      const response = await request.get("/");
      return /'nonce-([^']+)'/.exec(response.headers()["content-security-policy"])?.[1];
    };
    const [a, b] = [await nonceOf(), await nonceOf()];
    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });

  test("the page runs without a single CSP violation", async ({ page }) => {
    const violations: string[] = [];
    page.on("console", (message) => {
      if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Build today's plan/ })).toBeEnabled();
    // The button only works once React has hydrated, which needs the nonce'd scripts to run.
    await page.getByLabel("Where do you live?").fill("Pune");
    await expect(page.getByLabel("Where do you live?")).toHaveValue("Pune");
    expect(violations).toEqual([]);
  });

  test("the nonce is applied to the page's own scripts", async ({ page }) => {
    await page.goto("/");
    const unnonced = await page.evaluate(
      () => [...document.scripts].filter((s) => s.src && !s.hasAttribute("nonce")).length,
    );
    expect(unnonced).toBe(0);
  });

  test("API responses are not framed or scripted", async ({ request }) => {
    const response = await request.post("/api/plan", { data: "{}", headers: { "content-type": "application/json" } });
    expect(response.status()).toBe(422);
    expect(response.headers()["cache-control"]).toBe("no-store");
  });

  test("a cross-site API call is refused", async ({ request }) => {
    const response = await request.post("/api/plan", {
      data: {},
      headers: { "sec-fetch-site": "cross-site" },
    });
    expect(response.status()).toBe(403);
  });
});
