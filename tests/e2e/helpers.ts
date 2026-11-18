import type { Page, Route } from "@playwright/test";
import { planResultFixture } from "../fixtures/results";

export const ANSWER_TEXT = "Keep the kids indoors until 12:00, then a short walk is fine.";

/** Mocks /api/plan with the Delhi fixture. Records request bodies. */
export async function mockPlan(page: Page): Promise<unknown[]> {
  const bodies: unknown[] = [];
  await page.route("**/api/plan", async (route: Route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ json: planResultFixture() });
  });
  return bodies;
}

export async function mockPlanError(page: Page, status: number, error: string): Promise<void> {
  await page.route("**/api/plan", (route) => route.fulfill({ status, json: { error } }));
}

export async function mockAsk(page: Page, text = ANSWER_TEXT): Promise<unknown[]> {
  const bodies: unknown[] = [];
  await page.route("**/api/ask", async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "text/plain; charset=utf-8", body: text });
  });
  return bodies;
}

/** Opens the app, mocks the plan API, and submits the default form. */
export async function openWithResults(page: Page): Promise<void> {
  await mockPlan(page);
  await page.goto("/");
  await page.getByRole("button", { name: /Build today's plan/ }).click();
  await page.getByRole("heading", { name: /Next 24 hours/ }).waitFor();
}
