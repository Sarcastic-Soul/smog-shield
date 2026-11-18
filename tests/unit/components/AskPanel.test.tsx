import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AskPanel } from "@/components/AskPanel";
import { askQuestion } from "@/lib/client/api";
import { makeProfile } from "../../fixtures/profiles";

vi.mock("@/lib/client/api", () => ({ askQuestion: vi.fn() }));
const mockedAsk = vi.mocked(askQuestion);

beforeEach(() => {
  mockedAsk.mockReset();
  mockedAsk.mockImplementation(async (_profile, _question, onText) => {
    onText("Keep ");
    onText("Keep them inside.");
  });
});

describe("AskPanel", () => {
  it("keeps Ask disabled until the question has 3 characters", async () => {
    const user = userEvent.setup();
    render(<AskPanel profile={makeProfile()} />);
    const ask = screen.getByRole("button", { name: "Ask" });
    expect(ask).toBeDisabled();
    await user.type(screen.getByLabelText("Your question"), "hey");
    expect(ask).toBeEnabled();
  });

  it("sends the profile and question, then shows the streamed answer", async () => {
    const user = userEvent.setup();
    const profile = makeProfile();
    render(<AskPanel profile={profile} />);
    await user.type(screen.getByLabelText("Your question"), "Can we walk?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText("Keep them inside.")).toBeInTheDocument();
    expect(mockedAsk.mock.calls[0][0]).toEqual(profile);
    expect(mockedAsk.mock.calls[0][1]).toBe("Can we walk?");
    expect(screen.getByText("You asked: Can we walk?")).toBeInTheDocument();
    expect(screen.getByLabelText("Your question")).toHaveValue("");
  });

  it("asks straight away when a suggestion is clicked", async () => {
    const user = userEvent.setup();
    render(<AskPanel profile={makeProfile()} />);
    await user.click(screen.getByRole("button", { name: "Which room should get the purifier?" }));
    await waitFor(() => expect(mockedAsk).toHaveBeenCalledTimes(1));
    expect(mockedAsk.mock.calls[0][1]).toBe("Which room should get the purifier?");
  });

  it("shows an alert when the request fails", async () => {
    mockedAsk.mockRejectedValue(new Error("The assistant is offline right now."));
    const user = userEvent.setup();
    render(<AskPanel profile={makeProfile()} />);
    await user.type(screen.getByLabelText("Your question"), "Is it safe?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The assistant is offline right now.");
  });
});
