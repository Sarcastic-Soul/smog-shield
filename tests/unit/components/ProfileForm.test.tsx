import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProfileForm } from "@/components/ProfileForm";
import type { Profile } from "@/lib/domain/profile-options";
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

  it("has a plan language select with every language in its own script", () => {
    setup();
    const select = screen.getByLabelText("Plan language");
    expect(select).toHaveValue("en");
    expect([...(select as HTMLSelectElement).options].map((o) => o.text)).toEqual([
      "English",
      "हिन्दी",
      "اردو",
      "বাংলা",
      "ਪੰਜਾਬੀ",
    ]);
  });

  it("reports a language change", async () => {
    const { onChange, user } = setup();
    await user.selectOptions(screen.getByLabelText("Plan language"), "ur");
    expect(onChange.mock.calls[0][0].language).toBe("ur");
  });

  it("has smoker and waste-burning checkboxes that update home", async () => {
    const { onChange, user } = setup();
    expect(screen.getByRole("checkbox", { name: "Someone smokes indoors" })).not.toBeChecked();
    await user.click(screen.getByRole("checkbox", { name: "Someone smokes indoors" }));
    expect(onChange.mock.calls[0][0].home).toMatchObject({ smokerAtHome: true, wasteBurningNearby: false });
    await user.click(screen.getByRole("checkbox", { name: "Waste or crop burning near us" }));
    expect(onChange.mock.calls[1][0].home).toMatchObject({ wasteBurningNearby: true });
  });

  it("reflects saved smoker and burning values", () => {
    const base = makeProfile();
    setup({ ...base, home: { ...base.home, smokerAtHome: true, wasteBurningNearby: true, hasPurifier: true } });
    expect(screen.getByRole("checkbox", { name: "Someone smokes indoors" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Waste or crop burning near us" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "We own an air purifier" })).toBeChecked();
  });

  it("hints to use English letters for the city and links the hint to the field", () => {
    setup();
    const hint = screen.getByText(/Use English letters/);
    expect(screen.getByLabelText("Where do you live?")).toHaveAttribute("aria-describedby", hint.id);
  });

  it("changes the cooking fuel, heating and commute mode through their selects", async () => {
    const { onChange, user } = setup();
    await user.selectOptions(screen.getByLabelText("Cooking fuel"), "biomass");
    expect(onChange.mock.calls[0][0].home.cooking).toBe("biomass");
    await user.selectOptions(screen.getByLabelText("Winter heating"), "coal_or_wood");
    expect(onChange.mock.calls[1][0].home.heating).toBe("coal_or_wood");
    await user.selectOptions(screen.getByLabelText("Main way to work or school"), "metro");
    expect(onChange.mock.calls[2][0].commute.mode).toBe("metro");
  });

  it("updates notes and the purifier flag", async () => {
    const { onChange, user } = setup();
    await user.type(screen.getByLabelText(/Anything else/), "x");
    expect(onChange.mock.calls[0][0].notes).toBe("x");
    await user.click(screen.getByRole("checkbox", { name: "We own an air purifier" }));
    expect(onChange.mock.calls[1][0].home.hasPurifier).toBe(true);
  });

  it("updates commute distance, days and exercise minutes within their limits", () => {
    const { onChange } = setup();
    fireEvent.change(screen.getByLabelText("One way (km)"), { target: { value: "500" } });
    expect(onChange.mock.calls[0][0].commute.distanceKm).toBe(150);
    fireEvent.change(screen.getByLabelText("Days a week"), { target: { value: "3" } });
    expect(onChange.mock.calls[1][0].commute.daysPerWeek).toBe(3);
    fireEvent.change(screen.getByLabelText("Outdoor walk or exercise (min a day)"), { target: { value: "30" } });
    expect(onChange.mock.calls[2][0].home.outdoorExerciseMinutes).toBe(30);
    fireEvent.change(screen.getByLabelText("Children"), { target: { value: "3" } });
    expect(onChange.mock.calls[3][0].household.children).toBe(3);
    fireEvent.change(screen.getByLabelText("Over 65"), { target: { value: "2" } });
    expect(onChange.mock.calls[4][0].household.seniors).toBe(2);
  });
});
