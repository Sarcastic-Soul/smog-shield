import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmptyState, ErrorState, LoadingState } from "@/components/ResultStates";

describe("EmptyState", () => {
  it("shows the headline and the three steps in order", () => {
    render(<EmptyState />);
    expect(screen.getByText(/Winter smog changes by the hour/)).toBeInTheDocument();
    const steps = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toContain("Live readings");
    expect(steps[1]).toContain("Your household");
    expect(steps[2]).toContain("A plan with numbers");
  });

  it("tells the user which button to press", () => {
    render(<EmptyState />);
    expect(screen.getByText("Build today's plan")).toBeInTheDocument();
  });
});

describe("LoadingState", () => {
  it("names the city being read", () => {
    render(<LoadingState city="Lahore" />);
    expect(screen.getByText("Reading the air over Lahore…")).toBeInTheDocument();
  });
});

describe("ErrorState", () => {
  it("announces the message as an alert", () => {
    render(<ErrorState message="Air service is down" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("We could not build your plan");
    expect(alert).toHaveTextContent("Air service is down");
  });
});
