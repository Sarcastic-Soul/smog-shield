import { expect, test } from "@playwright/test";
import { planResultFixture } from "../fixtures/results";
import { ANSWER_TEXT, mockAsk, mockPlan, mockPlanError, openWithResults } from "./helpers";

const result = planResultFixture();

test.describe("plan flow", () => {
  test("shows the intro before anything is submitted", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Smog Shield");
    await expect(page.getByText("Winter smog changes by the hour")).toBeVisible();
    await expect(page.getByRole("button", { name: /Build today's plan/ })).toBeEnabled();
  });

  test("fills the city, submits, and shows AQI, forecast, routine and swaps", async ({ page }) => {
    const bodies = await mockPlan(page);
    await page.goto("/");

    const city = page.getByLabel("Where do you live?");
    await city.fill("Lucknow");
    await page.getByRole("button", { name: /Build today's plan/ }).click();

    // Request carries the typed city.
    await expect.poll(() => bodies.length).toBe(1);
    expect((bodies[0] as { profile: { city: string } }).profile.city).toBe("Lucknow");

    const airNow = page.getByRole("region", { name: /Air now/ });
    await expect(airNow.getByText(String(result.report.now.aqi), { exact: true })).toBeVisible();
    await expect(airNow.getByText("Unhealthy for sensitive groups")).toBeVisible();
    await expect(airNow.getByText("High risk for your home")).toBeVisible();

    const forecast = page.getByRole("region", { name: "Next 24 hours" });
    await expect(forecast).toContainText("Cleanest 12:00–14:00");
    await expect(forecast).toContainText("Worst 19:00–21:00");
    await expect(forecast.locator("table caption")).toHaveText(/^Hourly .*forecast$/);

    const plan = page.getByRole("region", { name: result.plan.headline });
    await expect(plan.getByRole("heading", { name: "Your next 24 hours" })).toBeVisible();
    await expect(plan.getByText("07:00", { exact: true })).toBeVisible();
    await expect(plan.getByRole("heading", { name: "Cleaner air indoors" })).toBeVisible();
    await expect(plan.getByRole("heading", { name: "Swaps that cut emissions" })).toBeVisible();
    await expect(plan.getByText(/Petrol car → Work from home/)).toBeVisible();
  });

  test("tags routine steps that fall tomorrow", async ({ page }) => {
    await openWithResults(page);
    const routine = page.getByRole("list", { name: "Your next 24 hours" });
    const tomorrowSteps = result.plan.routine.filter((s) => s.day === "tomorrow");
    expect(tomorrowSteps.length).toBeGreaterThan(0);
    await expect(routine.getByText("tomorrow", { exact: true })).toHaveCount(tomorrowSteps.length);
    await expect(routine.getByRole("listitem").first()).not.toContainText("tomorrow");
  });

  test("shows the community section with actions and impact", async ({ page }) => {
    await openWithResults(page);
    await expect(page.getByRole("heading", { name: "With your neighbours" })).toBeVisible();
    const list = page.getByRole("list", { name: "With your neighbours" });
    await expect(list.getByRole("listitem")).toHaveCount(result.plan.communityActions.length);
    await expect(list).toContainText(result.plan.communityActions[0].who);
    await expect(list).toContainText(result.plan.communityActions[0].impact);
  });

  test("shows the three-day outlook under the forecast", async ({ page }) => {
    await openWithResults(page);
    const forecast = page.getByRole("region", { name: "Next 24 hours" });
    await expect(forecast.getByRole("heading", { name: "Next few days" })).toBeVisible();
    await expect(forecast.getByText(/Smog is building/)).toBeVisible();
    await expect(forecast.getByRole("listitem")).toHaveCount(3);
  });

  test("scales the commute saving to a building and a ward", async ({ page }) => {
    await openWithResults(page);
    const simulator = page.getByRole("region", { name: "Try a change, see the effect" });
    const scale = simulator.getByLabel("How many homes make this change?");
    await scale.selectOption("building");
    await expect(simulator.getByRole("status").first()).toContainText("CO₂ saved a year by 40 homes");
    await scale.selectOption("ward");
    await expect(simulator.getByRole("status").first()).toContainText("1,000 homes");
  });

  test("changing the plan language sends it and marks Urdu text right to left", async ({ page }) => {
    const bodies = await mockPlan(page);
    await page.goto("/");
    const language = page.getByLabel("Plan language");
    await expect(language).toHaveValue("en");
    await language.selectOption("ur");
    await expect(language).toHaveValue("ur");
    await page.getByRole("button", { name: /Build today's plan/ }).click();
    await page.getByRole("heading", { name: /Next 24 hours/ }).waitFor();

    expect((bodies[0] as { profile: { language: string } }).profile.language).toBe("ur");
    const headline = page.getByRole("heading", { name: result.plan.headline });
    await expect(headline).toHaveAttribute("lang", "ur");
    await expect(headline).toHaveAttribute("dir", "rtl");
  });

  test("sends the smoker and burning choices with the profile", async ({ page }) => {
    const bodies = await mockPlan(page);
    await page.goto("/");
    await page.getByRole("checkbox", { name: "Someone smokes indoors" }).check();
    await page.getByRole("checkbox", { name: "Waste or crop burning near us" }).check();
    await page.getByRole("button", { name: /Build today's plan/ }).click();
    await expect.poll(() => bodies.length).toBe(1);
    expect((bodies[0] as { profile: { home: object } }).profile.home).toMatchObject({
      smokerAtHome: true,
      wasteBurningNearby: true,
    });
  });

  test("moves focus to the results after submitting", async ({ page }) => {
    await openWithResults(page);
    await expect(page.locator("#results")).toBeFocused();
  });

  test("impact simulator updates when another commute is chosen", async ({ page }) => {
    await openWithResults(page);
    const simulator = page.getByRole("region", { name: "Try a change, see the effect" });
    const commuteOutput = simulator.getByRole("status").first();

    const wfh = result.insights.commute.swaps.find((s) => s.to === "work_from_home")!;
    const metro = result.insights.commute.swaps.find((s) => s.to === "metro")!;
    await expect(commuteOutput).toContainText(`${wfh.co2KgSavedPerYear} kg`);

    await simulator.getByRole("radio", { name: "Metro / train" }).check();
    await expect(commuteOutput).toContainText(`${metro.co2KgSavedPerYear} kg`);

    await simulator.getByRole("checkbox", { name: /HEPA purifier/ }).uncheck();
    await expect(simulator.getByRole("status").nth(1)).toContainText(`~${result.insights.indoor.indoorPm25} µg/m³`);
  });

  test("ask panel shows the answer to a typed question", async ({ page }) => {
    const asked = await mockAsk(page);
    await openWithResults(page);

    await page.getByLabel("Your question").fill("Can my kids play outside?");
    await page.getByRole("button", { name: "Ask", exact: true }).click();

    await expect(page.getByText(ANSWER_TEXT)).toBeVisible();
    await expect(page.getByText("You asked: Can my kids play outside?")).toBeVisible();
    expect((asked[0] as { question: string }).question).toBe("Can my kids play outside?");
  });

  test("ask panel answers a suggested question in one click", async ({ page }) => {
    await mockAsk(page);
    await openWithResults(page);
    await page.getByRole("button", { name: "Is a cloth mask enough for my commute?" }).click();
    await expect(page.getByText(ANSWER_TEXT)).toBeVisible();
  });

  test("ask panel shows a clear message when the assistant is offline", async ({ page }) => {
    await page.route("**/api/ask", (route) =>
      route.fulfill({ status: 503, json: { error: "The assistant is offline right now. Your plan still works." } }),
    );
    await openWithResults(page);
    await page.getByRole("button", { name: "Which room should get the purifier?" }).click();
    await expect(page.locator("#results").getByRole("alert").filter({ hasText: "offline right now" })).toBeVisible();
  });

  test("shows the server message when the city is not found (404)", async ({ page }) => {
    await mockPlanError(page, 404, 'We could not find "Atlantis"');
    await page.goto("/");
    await page.getByLabel("Where do you live?").fill("Atlantis");
    await page.getByRole("button", { name: /Build today's plan/ }).click();

    const alert = page.locator("#results").getByRole("alert");
    await expect(alert).toContainText("We could not build your plan.");
    await expect(alert).toContainText('We could not find "Atlantis"');
    await expect(page.getByRole("button", { name: /Build today's plan/ })).toBeEnabled();
  });

  test("blocks a bad city before calling the API", async ({ page }) => {
    const bodies = await mockPlan(page);
    await page.goto("/");
    await page.getByLabel("Where do you live?").fill("<script>");
    await page.getByRole("button", { name: /Build today's plan/ }).click();
    await expect(page.locator("#results").getByRole("alert")).toContainText("Use letters only");
    expect(bodies).toHaveLength(0);
  });

  test("remembers the household between visits", async ({ page }) => {
    await mockPlan(page);
    await page.goto("/");
    await page.getByLabel("Plan language").selectOption("hi");
    await page.getByLabel("Where do you live?").fill("Pune");
    await page.getByRole("button", { name: /Build today's plan/ }).click();
    await page.getByRole("heading", { name: /Next 24 hours/ }).waitFor();
    await page.reload();
    await expect(page.getByLabel("Where do you live?")).toHaveValue("Pune");
    await expect(page.getByLabel("Plan language")).toHaveValue("hi");
  });

  test("sends one request when the build button is double-clicked", async ({ page }) => {
    const bodies = await mockPlan(page);
    await page.goto("/");
    await page.getByRole("button", { name: /Build today's plan/ }).dblclick();
    await page.getByRole("heading", { name: /Next 24 hours/ }).waitFor();
    expect(bodies).toHaveLength(1);
  });
});
