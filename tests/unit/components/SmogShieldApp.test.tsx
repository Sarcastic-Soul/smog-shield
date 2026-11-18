import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SmogShieldApp } from "@/components/SmogShieldApp";
import { requestPlan } from "@/lib/client/api";
import type { PlanResult } from "@/lib/domain/result";
import { makeProfile } from "../../fixtures/profiles";
import { planResultFixture } from "../../fixtures/results";

vi.mock("@/lib/client/api", () => ({ requestPlan: vi.fn(), askQuestion: vi.fn() }));
const mockedPlan = vi.mocked(requestPlan);

const STORAGE_KEY = "smog-shield:profile";
const buildButton = () => screen.getByRole("button", { name: /Build today's plan|Reading today's air/ });

function deferred() {
  let resolve!: (result: PlanResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<PlanResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  mockedPlan.mockReset();
  window.localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

describe("SmogShieldApp", () => {
  it("starts idle with the intro and an enabled button", () => {
    render(<SmogShieldApp />);
    expect(screen.getByText(/Winter smog changes by the hour/)).toBeInTheDocument();
    expect(buildButton()).toBeEnabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("goes idle, then loading, then ready", async () => {
    const pending = deferred();
    mockedPlan.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    render(<SmogShieldApp />);

    await user.click(buildButton());

    expect(await screen.findByText(/Reading the air over New Delhi/)).toBeInTheDocument();
    expect(buildButton()).toBeDisabled();
    expect(document.getElementById("results")).toHaveAttribute("aria-busy", "true");

    await act(async () => pending.resolve(planResultFixture()));

    expect(await screen.findByRole("heading", { name: /Air now in New Delhi/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Next 24 hours" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "With your neighbours" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Try a change, see the effect" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ask about your day" })).toBeInTheDocument();
    expect(buildButton()).toBeEnabled();
    expect(document.getElementById("results")).toHaveAttribute("aria-busy", "false");
  });

  it("sends the validated profile to the plan request", async () => {
    mockedPlan.mockResolvedValue(planResultFixture());
    const user = userEvent.setup();
    render(<SmogShieldApp />);
    const city = screen.getByLabelText("Where do you live?");
    await user.clear(city);
    await user.type(city, "  Lucknow ");
    await user.click(buildButton());
    await screen.findByRole("heading", { name: /Air now in/ });
    expect(mockedPlan).toHaveBeenCalledTimes(1);
    expect(mockedPlan.mock.calls[0][0]).toMatchObject({ city: "Lucknow", language: "en" });
    expect(mockedPlan.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
  });

  it("shows the error message and lets the user try again", async () => {
    mockedPlan.mockRejectedValueOnce(new Error('We could not find "Atlantis"'));
    const user = userEvent.setup();
    render(<SmogShieldApp />);
    await user.click(buildButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We could not build your plan.");
    expect(alert).toHaveTextContent('We could not find "Atlantis"');
    expect(buildButton()).toBeEnabled();

    mockedPlan.mockResolvedValueOnce(planResultFixture());
    await user.click(buildButton());
    expect(await screen.findByRole("heading", { name: /Air now in/ })).toBeInTheDocument();
    expect(screen.queryByText("We could not build your plan.")).not.toBeInTheDocument();
  });

  it("uses a generic message when a non-Error is thrown", async () => {
    mockedPlan.mockRejectedValueOnce("boom");
    const user = userEvent.setup();
    render(<SmogShieldApp />);
    await user.click(buildButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.");
  });

  it("does not call the API when the city is invalid", async () => {
    const user = userEvent.setup();
    render(<SmogShieldApp />);
    const city = screen.getByLabelText("Where do you live?");
    await user.clear(city);
    await user.type(city, "<b>");
    await user.click(buildButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("Use letters only");
    expect(mockedPlan).not.toHaveBeenCalled();
  });

  it("sends only one request when the form is submitted twice in a row", async () => {
    const pending = deferred();
    mockedPlan.mockReturnValue(pending.promise);
    render(<SmogShieldApp />);
    const form = screen.getByRole("form", { name: "Your household" });

    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(mockedPlan).toHaveBeenCalledTimes(1);
    await act(async () => pending.resolve(planResultFixture()));
    await screen.findByRole("heading", { name: /Air now in/ });

    // The guard is released afterwards.
    mockedPlan.mockResolvedValue(planResultFixture());
    fireEvent.submit(form);
    await waitFor(() => expect(mockedPlan).toHaveBeenCalledTimes(2));
  });

  it("restores a saved profile from localStorage after mount", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(makeProfile({ city: "Pune", language: "hi" })));
    render(<SmogShieldApp />);
    await waitFor(() => expect(screen.getByLabelText("Where do you live?")).toHaveValue("Pune"));
    expect(screen.getByLabelText("Plan language")).toHaveValue("hi");
  });

  it("ignores a saved profile that is not valid", async () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ city: "Pune" }));
    render(<SmogShieldApp />);
    expect(screen.getByLabelText("Where do you live?")).toHaveValue("New Delhi");
  });

  it("ignores saved text that is not JSON", () => {
    window.localStorage.setItem(STORAGE_KEY, "{nope");
    render(<SmogShieldApp />);
    expect(screen.getByLabelText("Where do you live?")).toHaveValue("New Delhi");
  });

  it("saves the profile when a plan is requested", async () => {
    mockedPlan.mockResolvedValue(planResultFixture());
    const user = userEvent.setup();
    render(<SmogShieldApp />);
    const city = screen.getByLabelText("Where do you live?");
    await user.clear(city);
    await user.type(city, "Jaipur");
    await user.click(buildButton());
    await screen.findByRole("heading", { name: /Air now in/ });
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!).city).toBe("Jaipur");
  });

  it("still works when storage is blocked", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    mockedPlan.mockResolvedValue(planResultFixture());
    const user = userEvent.setup();
    render(<SmogShieldApp />);
    await user.click(buildButton());
    expect(await screen.findByRole("heading", { name: /Air now in/ })).toBeInTheDocument();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("stays quiet when the request is aborted on unmount", async () => {
    const pending = deferred();
    mockedPlan.mockReturnValue(pending.promise);
    const user = userEvent.setup();
    const { unmount } = render(<SmogShieldApp />);
    await user.click(buildButton());
    const signal = mockedPlan.mock.calls[0][1] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.reject(new DOMException("aborted", "AbortError")));
  });

  it("shows the plan in the chosen language with right-to-left text for Urdu", async () => {
    mockedPlan.mockResolvedValue(planResultFixture());
    const user = userEvent.setup();
    render(<SmogShieldApp />);
    await user.selectOptions(screen.getByLabelText("Plan language"), "ur");
    await user.click(buildButton());
    const headline = await screen.findByRole("heading", { name: planResultFixture().plan.headline });
    expect(headline).toHaveAttribute("lang", "ur");
    expect(headline).toHaveAttribute("dir", "rtl");
  });
});
