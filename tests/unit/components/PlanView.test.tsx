import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlanView } from "@/components/PlanView";
import type { Plan } from "@/lib/domain/plan";
import type { Language } from "@/lib/domain/profile";
import { planResultFixture } from "../../fixtures/results";

const fixture = planResultFixture();

function setup(
  options: { plan?: Plan; source?: "gemini" | "rules"; alerts?: string[]; language?: Language; pending?: boolean } = {},
) {
  return render(
    <PlanView
      plan={options.plan ?? fixture.plan}
      source={options.source ?? "rules"}
      pending={options.pending ?? false}
      safetyAlerts={options.alerts ?? []}
      language={options.language ?? "en"}
    />,
  );
}

describe("PlanView", () => {
  it("shows the headline, summary and the section headings", () => {
    setup();
    expect(screen.getByRole("heading", { name: fixture.plan.headline })).toBeInTheDocument();
    expect(screen.getByText(fixture.plan.summary)).toBeInTheDocument();
    for (const name of [
      "Your next 24 hours",
      "Cleaner air indoors",
      "For the people most at risk",
      "Swaps that cut emissions",
      "With your neighbours",
    ]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
  });

  it("says where the plan came from", () => {
    const { unmount } = setup({ source: "gemini" });
    expect(screen.getByText(/Written by Gemini/)).toBeInTheDocument();
    unmount();
    setup({ source: "rules" });
    expect(screen.getByText(/Built from rules/)).toBeInTheDocument();
  });

  it("tags routine steps that fall tomorrow", () => {
    setup();
    const steps = within(screen.getByRole("list", { name: "Your next 24 hours" })).getAllByRole("listitem");
    expect(steps).toHaveLength(fixture.plan.routine.length);
    const tomorrow = fixture.plan.routine.filter((s) => s.day === "tomorrow");
    expect(tomorrow.length).toBeGreaterThan(0);
    expect(screen.getAllByText("tomorrow")).toHaveLength(tomorrow.length);
    const first = steps[0];
    expect(within(first).queryByText("tomorrow")).not.toBeInTheDocument();
    expect(within(steps.at(-1)!).getByText("tomorrow")).toBeInTheDocument();
  });

  it("keeps the tag in English inside a translated plan", () => {
    setup({ language: "hi" });
    expect(screen.getAllByText("tomorrow")[0]).toHaveAttribute("lang", "en");
  });

  it("lists the community actions with who, action and impact", () => {
    setup();
    const list = screen.getByRole("list", { name: "With your neighbours" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(fixture.plan.communityActions.length);
    for (const action of fixture.plan.communityActions) {
      expect(within(list).getByText(action.who)).toBeInTheDocument();
      expect(within(list).getByText(action.action)).toBeInTheDocument();
      expect(within(list).getByText(action.impact)).toBeInTheDocument();
    }
  });

  it("lists indoor hacks, group advice and swaps", () => {
    setup();
    expect(within(screen.getByRole("list", { name: "Cleaner air indoors" })).getAllByRole("listitem")).toHaveLength(
      fixture.plan.indoorHacks.length,
    );
    expect(screen.getByText(fixture.plan.groupAdvice[0].group)).toBeInTheDocument();
    expect(screen.getByText(fixture.plan.alternatives[0].swap)).toBeInTheDocument();
  });

  it("hides the at-risk section when there is no group advice", () => {
    setup({ plan: { ...fixture.plan, groupAdvice: [] } });
    expect(screen.queryByRole("heading", { name: "For the people most at risk" })).not.toBeInTheDocument();
  });

  it("shows safety alerts in an alert region, and none when there are none", () => {
    const { unmount } = setup({ alerts: ["Never sleep with a coal fire lit."] });
    expect(screen.getByRole("alert")).toHaveTextContent("Never sleep with a coal fire lit.");
    unmount();
    setup();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("marks plan text as left to right English by default", () => {
    setup();
    const headline = screen.getByRole("heading", { name: fixture.plan.headline });
    expect(headline).toHaveAttribute("lang", "en");
    expect(headline).toHaveAttribute("dir", "ltr");
  });

  it("sets lang and dir=rtl on Urdu text", () => {
    setup({ language: "ur", source: "gemini" });
    for (const el of [
      screen.getByRole("heading", { name: fixture.plan.headline }),
      screen.getByRole("list", { name: "Your next 24 hours" }),
      screen.getByRole("list", { name: "With your neighbours" }),
      screen.getByRole("list", { name: "Cleaner air indoors" }),
    ]) {
      expect(el).toHaveAttribute("lang", "ur");
      expect(el).toHaveAttribute("dir", "rtl");
    }
  });

  it("sets lang with left-to-right for Hindi, Bengali and Punjabi", () => {
    for (const language of ["hi", "bn", "pa"] as const) {
      const { unmount } = setup({ language, source: "gemini" });
      const headline = screen.getByRole("heading", { name: fixture.plan.headline });
      expect(headline).toHaveAttribute("lang", language);
      expect(headline).toHaveAttribute("dir", "ltr");
      unmount();
    }
  });

  it("keeps rules plans in English (lang=en, dir=ltr) whatever language was chosen", () => {
    setup({ language: "ur", source: "rules" });
    const headline = screen.getByRole("heading", { name: fixture.plan.headline });
    expect(headline).toHaveAttribute("lang", "en");
    expect(headline).toHaveAttribute("dir", "ltr");
    expect(screen.getByRole("list", { name: "Your next 24 hours" })).toHaveAttribute("dir", "ltr");
  });

  it("shows an English-fallback note for a rules plan in another language", () => {
    setup({ language: "hi", source: "rules" });
    expect(screen.getByText(/this plan is in English/)).toBeInTheDocument();
  });

  it("shows no fallback note for English, Gemini plans, or drafts", () => {
    const cases = [
      { language: "en", source: "rules" },
      { language: "hi", source: "gemini" },
      { language: "hi", source: "rules", pending: true },
    ] as const;
    for (const options of cases) {
      const { unmount } = setup(options);
      expect(screen.queryByText(/this plan is in English/)).not.toBeInTheDocument();
      unmount();
    }
  });

  it("shows the pending note and a quick-plan label while Gemini is still writing", () => {
    setup({ pending: true });
    expect(screen.getByText(/Gemini is tailoring this plan to your household/)).toBeInTheDocument();
    expect(screen.getByText(/Quick plan from today's numbers/)).toBeInTheDocument();
    expect(screen.queryByText(/Built from rules/)).not.toBeInTheDocument();
  });

  it("hides the pending note when the plan is final", () => {
    setup({ pending: false });
    expect(screen.queryByText(/Gemini is tailoring/)).not.toBeInTheDocument();
  });
});
