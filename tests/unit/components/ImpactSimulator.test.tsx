import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ImpactSimulator } from "@/components/ImpactSimulator";
import { communityImpact } from "@/lib/domain/impact";
import { buildInsights } from "@/lib/domain/insights";
import { delhiReport } from "../../fixtures/delhi";
import { healthyProfile, makeProfile } from "../../fixtures/profiles";

function setup(profile = makeProfile()) {
  const insights = buildInsights(profile, delhiReport());
  render(<ImpactSimulator profile={profile} insights={insights} />);
  return { insights, user: userEvent.setup() };
}

const outputs = () => screen.getAllByRole("status");

describe("ImpactSimulator", () => {
  it("lists commute swaps as radios, with the biggest saving selected", () => {
    const { insights } = setup();
    expect(screen.getAllByRole("radio")).toHaveLength(insights.commute.swaps.length);
    expect(screen.getByRole("radio", { name: "Work from home" })).toBeChecked();
    expect(within(outputs()[0]).getByText(`${insights.commute.swaps[0].co2KgSavedPerYear} kg`)).toBeInTheDocument();
  });

  it("changes the yearly CO2 figure when another commute is picked", async () => {
    const { insights, user } = setup();
    const metro = insights.commute.swaps.find((s) => s.to === "metro")!;
    const wfh = insights.commute.swaps.find((s) => s.to === "work_from_home")!;
    expect(metro.co2KgSavedPerYear).not.toBe(wfh.co2KgSavedPerYear);

    await user.click(screen.getByRole("radio", { name: "Metro / train" }));

    expect(screen.getByRole("radio", { name: "Metro / train" })).toBeChecked();
    expect(within(outputs()[0]).getByText(`${metro.co2KgSavedPerYear} kg`)).toBeInTheDocument();
    expect(within(outputs()[0]).queryByText(`${wfh.co2KgSavedPerYear} kg`)).not.toBeInTheDocument();
  });

  it("shows the indoor PM2.5 with and without a purifier", async () => {
    const { insights, user } = setup();
    expect(within(outputs()[1]).getByText(`~${insights.indoor.indoorWithPurifier} µg/m³`)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /HEPA purifier/ }));
    expect(within(outputs()[1]).getByText(`~${insights.indoor.indoorPm25} µg/m³`)).toBeInTheDocument();
  });

  it("offers an indoor session on a high-risk day, then the worst-hour dose when unchecked", async () => {
    const { insights, user } = setup();
    expect(insights.risk.level).toBe("high");
    const exercise = insights.exercise!;
    expect(within(outputs()[2]).getByText(`${exercise.indoorDose} µg`)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Do my 45-min exercise indoors/ }));
    expect(within(outputs()[2]).getByText(`${exercise.doseAtWorst} µg`)).toBeInTheDocument();
  });

  it("offers moving the walk to the best window when risk is low or moderate", async () => {
    const profile = healthyProfile();
    const { insights, user } = setup(profile);
    expect(insights.risk.level).toBe("moderate");
    const exercise = insights.exercise!;
    expect(within(outputs()[2]).getByText(`${exercise.doseAtBest} µg`)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Move my 45-min walk to 12:00/ }));
    expect(within(outputs()[2]).getByText(`${exercise.doseAtWorst} µg`)).toBeInTheDocument();
  });

  it("scales the CO2 saving to a building or ward", async () => {
    const { insights, user } = setup();
    const swap = insights.commute.swaps[0];
    await user.selectOptions(screen.getByLabelText("How many homes make this change?"), "ward");
    const expected = communityImpact(swap, 1000);
    expect(within(outputs()[0]).getByText(`${expected.co2TonnesPerYear} t`)).toBeInTheDocument();
    expect(outputs()[0]).toHaveTextContent("1,000 homes");
    await user.selectOptions(screen.getByLabelText("How many homes make this change?"), "building");
    expect(outputs()[0]).toHaveTextContent("40 homes");
  });

  it("says the commute is already low emission when there is nothing cleaner to swap to", () => {
    setup(makeProfile({ commute: { mode: "bicycle", distanceKm: 5, daysPerWeek: 5 } }));
    expect(screen.getByText("Your commute is already low emission.")).toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("says there is nothing to swap when working from home", () => {
    const profile = makeProfile({ commute: { mode: "work_from_home", distanceKm: 0, daysPerWeek: 0 } });
    setup(profile);
    expect(screen.getByText("No commute emissions this week, so there is nothing to swap.")).toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("asks for exercise minutes when there are none", () => {
    const base = makeProfile();
    setup({ ...base, home: { ...base.home, outdoorExerciseMinutes: 0 } });
    expect(screen.getByText(/Add daily outdoor minutes/)).toBeInTheDocument();
  });
});
