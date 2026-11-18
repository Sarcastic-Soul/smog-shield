import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mockAsk, mockPlan, openWithResults } from "./helpers";

async function seriousViolations(page: Page, skipRules: string[] = []) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .disableRules(skipRules)
    .analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(" ")) }));
}

test.describe("accessibility", () => {
  test("empty state has no serious or critical axe violations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: /Build today's plan/ })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("results state has no serious or critical axe violations", async ({ page }) => {
    await mockAsk(page);
    await openWithResults(page);
    await page.getByRole("button", { name: "Which room should get the purifier?" }).click();
    await expect(page.getByText("You asked:")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test("error state has no serious or critical axe violations", async ({ page }) => {
    await page.route("**/api/plan", (route) => route.fulfill({ status: 404, json: { error: "We could not find it" } }));
    await page.goto("/");
    await page.getByRole("button", { name: /Build today's plan/ }).click();
    await expect(page.locator("#results").getByRole("alert")).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe("keyboard", () => {
  test("skip link is the first stop and jumps to the main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("a keyboard-only user can reach the submit button and get a plan", async ({ page }) => {
    await openWithResultsViaKeyboard(page);
    await expect(page.getByRole("heading", { name: /Next 24 hours/ })).toBeVisible();
  });
});

async function openWithResultsViaKeyboard(page: Page) {
  await mockPlan(page);
  await page.goto("/");
  const submit = page.getByRole("button", { name: /Build today's plan/ });
  let reached = false;
  for (let i = 0; i < 80 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await submit.evaluate((el) => el === document.activeElement);
  }
  expect(reached, "submit button reachable with Tab").toBe(true);
  await page.keyboard.press("Enter");
}

test.describe("mobile layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("empty state does not scroll sideways", async ({ page }) => {
    await page.goto("/");
    await expectNoHorizontalScroll(page);
  });

  test("results state does not scroll sideways", async ({ page }) => {
    await openWithResults(page);
    await expectNoHorizontalScroll(page);
  });
});

async function expectNoHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}
