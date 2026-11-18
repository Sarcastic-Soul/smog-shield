import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ImpactSimulator } from "@/components/ImpactSimulator";
import { buildInsights } from "@/lib/domain/insights";
import { delhiReport } from "../../fixtures/delhi";
import { makeProfile } from "../../fixtures/profiles";

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

  it("shows the walk dose at the best window, then the worst when unchecked", async () => {
    const { insights, user } = setup();
    const exercise = insights.exercise!;
    expect(within(outputs()[2]).getByText(`${exercise.doseAtBest} µg`)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /Move my 45-min walk to 12:00/ }));
    expect(within(outputs()[2]).getByText(`${exercise.doseAtWorst} µg`)).toBeInTheDocument();
  });

  it("says the commute is already low emission when there are no swaps", () => {
    const profile = makeProfile({ commute: { mode: "work_from_home", distanceKm: 0, daysPerWeek: 0 } });
    setup(profile);
    expect(screen.getByText("Your commute is already low emission.")).toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("asks for exercise minutes when there are none", () => {
    const base = makeProfile();
    setup({ ...base, home: { ...base.home, outdoorExerciseMinutes: 0 } });
    expect(screen.getByText(/Add daily outdoor minutes/)).toBeInTheDocument();
  });
});
