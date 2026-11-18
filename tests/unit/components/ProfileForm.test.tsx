import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProfileForm } from "@/components/ProfileForm";
import type { Profile } from "@/lib/domain/profile";
import { makeProfile } from "../../fixtures/profiles";

function setup(profile: Profile = makeProfile(), busy = false) {
  const onChange = vi.fn();
  const onSubmit = vi.fn();
  render(<ProfileForm profile={profile} onChange={onChange} onSubmit={onSubmit} busy={busy} />);
  return { onChange, onSubmit, user: userEvent.setup() };
}

describe("ProfileForm", () => {
  it("labels every field", () => {
    setup();
    expect(screen.getByRole("form", { name: "Your household" })).toBeInTheDocument();
    for (const label of [
      "Where do you live?",
      "Adults",
      "Children",
      "Over 65",
      "Main way to work or school",
      "One way (km)",
      "Days a week",
      "Cooking fuel",
      "Winter heating",
      "Outdoor walk or exercise (min a day)",
      "We own an air purifier",
      /Anything else/,
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
    for (const condition of ["Asthma", "COPD", "Heart disease", "Pregnancy", "Allergies"]) {
      expect(screen.getByRole("checkbox", { name: condition })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("shows the current profile values", () => {
    setup();
    expect(screen.getByLabelText("Where do you live?")).toHaveValue("New Delhi");
    expect(screen.getByLabelText("Adults")).toHaveValue(2);
    expect(screen.getByRole("checkbox", { name: "Asthma" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "COPD" })).not.toBeChecked();
    expect(screen.getByText("0/280")).toBeInTheDocument();
  });

  it("calls onSubmit when the button is pressed", async () => {
    const { onSubmit, user } = setup();
    await user.click(screen.getByRole("button", { name: /Build today's plan/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("calls onSubmit when Enter is pressed in the city field", async () => {
    const { onSubmit, user } = setup();
    await user.type(screen.getByLabelText("Where do you live?"), "{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("adds a condition to the profile when its box is ticked", async () => {
    const { onChange, user } = setup();
    await user.click(screen.getByRole("checkbox", { name: "COPD" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].household.conditions).toEqual(["asthma", "copd"]);
  });

  it("removes a condition when its box is cleared", async () => {
    const { onChange, user } = setup();
    await user.click(screen.getByRole("checkbox", { name: "Asthma" }));
    expect(onChange.mock.calls[0][0].household.conditions).toEqual([]);
  });

  it("reports city edits without touching other fields", async () => {
    const { onChange, user } = setup();
    await user.type(screen.getByLabelText("Where do you live?"), "X");
    const next = onChange.mock.calls[0][0] as Profile;
    expect(next.city).toBe("New DelhiX");
    expect(next.household).toEqual(makeProfile().household);
  });

  it("reports a budget change", async () => {
    const { onChange, user } = setup();
    await user.click(screen.getByRole("radio", { name: "Tight" }));
    expect(onChange.mock.calls[0][0].budget).toBe("low");
  });

  it("clamps numbers to their allowed range", async () => {
    const { onChange, user } = setup();
    const adults = screen.getByLabelText("Adults");
    await user.clear(adults);
    // Clearing gives 0, below the minimum of 1.
    expect(onChange.mock.calls.at(-1)?.[0].household.adults).toBe(1);
  });

  it("hides distance and days when working from home", () => {
    const base = makeProfile();
    setup({ ...base, commute: { ...base.commute, mode: "work_from_home" } });
    expect(screen.queryByLabelText("One way (km)")).not.toBeInTheDocument();
  });

  it("disables the button and says it is working while busy", () => {
    setup(makeProfile(), true);
    const button = screen.getByRole("button", { name: /Reading today's air/ });
    expect(button).toBeDisabled();
  });

  it("shows the notes character count", () => {
    setup({ ...makeProfile(), notes: "hello" });
    expect(screen.getByText("5/280")).toBeInTheDocument();
  });
});
