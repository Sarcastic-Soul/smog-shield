import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SmogShieldApp } from "@/components/SmogShieldApp";
import { requestPlan } from "@/lib/client/api";
import type { PlanEvent } from "@/lib/domain/result";
import { makeProfile } from "../../fixtures/profiles";
import { planResultFixture } from "../../fixtures/results";

vi.mock("@/lib/client/api", () => ({ requestPlan: vi.fn(), askQuestion: vi.fn() }));
const mockedPlan = vi.mocked(requestPlan);

const STORAGE_KEY = "smog-shield:profile";
const liveLine = () => document.querySelector<HTMLElement>('p[role="status"]')!;
const buildButton = () => screen.getByRole("button", { name: /Build today's plan|Reading today's air/ });

const finalEvent = (result = planResultFixture()): PlanEvent => ({ kind: "final", result });
const draftEvent = (result = planResultFixture()): PlanEvent => ({ kind: "draft", result });

/** A requestPlan that emits the given events straight away. */
const emits =
  (...events: PlanEvent[]): typeof requestPlan =>
  async (_profile, onEvent) => {
    for (const event of events) onEvent(event);
  };

/** A requestPlan that waits for the test; `emit` sends events, `finish`/`fail` end the request. */
function controlled() {
  let onEvent!: (event: PlanEvent) => void;
  let finish!: () => void;
  let fail!: (error: unknown) => void;
  const gate = new Promise<void>((res, rej) => {
    finish = res;
    fail = rej;
  });
  const impl: typeof requestPlan = async (_profile, handler) => {
    onEvent = handler;
    await gate;
  };
  return {
    impl,
    emit: (event: PlanEvent) => act(async () => onEvent(event)),
    finish: () => act(async () => finish()),
    fail: (e: unknown) => act(async () => fail(e)),
  };
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
    expect(liveLine()).toBeEmptyDOMElement();
  });

  it("goes idle, then loading, then ready", async () => {
    const pending = controlled();
    mockedPlan.mockImplementation(pending.impl);
    const user = userEvent.setup();
    render(<SmogShieldApp />);

    await user.click(buildButton());

    expect(await screen.findByText(/Reading the air over New Delhi/)).toBeInTheDocument();
    expect(buildButton()).toBeDisabled();
    expect(liveLine()).toHaveTextContent("Reading today's air…");

    await pending.emit(finalEvent());
    await pending.finish();

    expect(await screen.findByRole("heading", { name: /Air now in New Delhi/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Next 24 hours" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "With your neighbours" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Try a change, see the effect" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ask about your day" })).toBeInTheDocument();
    expect(buildButton()).toBeEnabled();
    expect(liveLine()).toHaveTextContent(/Plan ready for New Delhi/);
  });

  it("sends the validated profile to the plan request", async () => {
    mockedPlan.mockImplementation(emits(finalEvent()));
    const user = userEvent.setup();
    render(<SmogShieldApp />);
    const city = screen.getByLabelText("Where do you live?");
    await user.clear(city);
    await user.type(city, "  Lucknow ");
    await user.click(buildButton());
    await screen.findByRole("heading", { name: /Air now in/ });
    expect(mockedPlan).toHaveBeenCalledTimes(1);
    expect(mockedPlan.mock.calls[0][0]).toMatchObject({ city: "Lucknow", language: "en" });
    expect(mockedPlan.mock.calls[0][2]).toBeInstanceOf(AbortSignal);
  });

  it("shows the error message and lets the user try again", async () => {
    mockedPlan.mockRejectedValueOnce(new Error('We could not find "Atlantis"'));
    const user = userEvent.setup();
    render(<SmogShieldApp />);
    await user.click(buildButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("We could not build your plan");
    expect(alert).toHaveTextContent('We could not find "Atlantis"');
    expect(buildButton()).toBeEnabled();

    mockedPlan.mockImplementationOnce(emits(finalEvent()));
    await user.click(buildButton());
    expect(await screen.findByRole("heading", { name: /Air now in/ })).toBeInTheDocument();
    expect(screen.queryByText("We could not build your plan")).not.toBeInTheDocument();
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
    expect(await screen.findByRole("alert")).toHaveTextContent("Use English letters for the city name");
    expect(mockedPlan).not.toHaveBeenCalled();
  });

  it("sends only one request when the form is submitted twice in a row", async () => {
    const pending = controlled();
    mockedPlan.mockImplementation(pending.impl);
    render(<SmogShieldApp />);
    const form = screen.getByRole("form", { name: "Your household" });

    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(mockedPlan).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(mockedPlan).toHaveBeenCalledTimes(1);
    await pending.emit(finalEvent());
    await pending.finish();
    await screen.findByRole("heading", { name: /Air now in/ });

    // The guard is released afterwards.
    mockedPlan.mockImplementation(emits(finalEvent()));
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
    mockedPlan.mockImplementation(emits(finalEvent()));
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
    mockedPlan.mockImplementation(emits(finalEvent()));
    const user = userEvent.setup();
    render(<SmogShieldApp />);
    await user.click(buildButton());
    expect(await screen.findByRole("heading", { name: /Air now in/ })).toBeInTheDocument();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it("stays quiet when the request is aborted on unmount", async () => {
    const pending = controlled();
    mockedPlan.mockImplementation(pending.impl);
    const user = userEvent.setup();
    const { unmount } = render(<SmogShieldApp />);
    await user.click(buildButton());
    const signal = mockedPlan.mock.calls[0][2] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await pending.fail(new DOMException("aborted", "AbortError"));
  });

  it("shows the plan in the chosen language with right-to-left text for Urdu", async () => {
    mockedPlan.mockImplementation(emits(finalEvent({ ...planResultFixture(), source: "gemini" })));
    const user = userEvent.setup();
    render(<SmogShieldApp />);
    await user.selectOptions(screen.getByLabelText("Plan language"), "ur");
    await user.click(buildButton());
    const headline = await screen.findByRole("heading", { name: planResultFixture().plan.headline });
    expect(headline).toHaveAttribute("lang", "ur");
    expect(headline).toHaveAttribute("dir", "rtl");
  });

  it("shows the draft with a pending note, then swaps in the final plan", async () => {
    const pending = controlled();
    mockedPlan.mockImplementation(pending.impl);
    const user = userEvent.setup();
    render(<SmogShieldApp />);
    await user.click(buildButton());

    const draft = planResultFixture();
    draft.plan = { ...draft.plan, headline: "Draft headline" };
    await pending.emit(draftEvent(draft));

    expect(await screen.findByRole("heading", { name: "Draft headline" })).toBeInTheDocument();
    expect(screen.getByText(/Gemini is tailoring this plan/)).toBeInTheDocument();
    expect(liveLine()).toHaveTextContent(/Gemini is tailoring it/);
    // Only the single live status line announces progress.
    expect(document.querySelectorAll('p[role="status"]')).toHaveLength(1);

    const final = planResultFixture();
    final.plan = { ...final.plan, headline: "Final headline" };
    final.source = "gemini";
    await pending.emit(finalEvent(final));
    await pending.finish();

    expect(await screen.findByRole("heading", { name: "Final headline" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Draft headline" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Gemini is tailoring this plan/)).not.toBeInTheDocument();
    expect(liveLine()).not.toHaveTextContent(/tailoring/);
    expect(liveLine()).toHaveTextContent(/Plan ready for New Delhi/);
  });

  it("scrolls to the results only once for draft and final", async () => {
    mockedPlan.mockImplementation(emits(draftEvent(), finalEvent()));
    const user = userEvent.setup();
    render(<SmogShieldApp />);
    await user.click(buildButton());
    await screen.findByRole("heading", { name: /Air now in/ });
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
  });

  it("keeps the draft visible and shows an error if the stream is cut off", async () => {
    mockedPlan.mockImplementation(async (_p, onEvent) => {
      onEvent(draftEvent());
      throw new Error("The plan was cut off. Please try again.");
    });
    const user = userEvent.setup();
    render(<SmogShieldApp />);
    await user.click(buildButton());
    expect(await screen.findByRole("alert")).toHaveTextContent("cut off");
  });

  it("has a status line for loading and errors", async () => {
    const pending = controlled();
    mockedPlan.mockImplementation(pending.impl);
    const user = userEvent.setup();
    render(<SmogShieldApp />);
    await user.click(buildButton());
    await waitFor(() => expect(liveLine()).toHaveTextContent("Reading today's air…"));
    await pending.fail(new Error("nope"));
    await waitFor(() => expect(liveLine()).toHaveTextContent("Could not build the plan: nope"));
  });
});
