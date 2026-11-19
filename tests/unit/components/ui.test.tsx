import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BandDot, Stat } from "@/components/ui";

describe("BandDot", () => {
  it("is decorative and takes its colour from the CSS variable", () => {
    const { container } = render(<BandDot colorVar="--aqi-unhealthy" />);
    const dot = container.firstElementChild as HTMLElement;
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot.style.background).toBe("var(--aqi-unhealthy)");
  });

  it("is smaller at size sm", () => {
    const { container } = render(<BandDot colorVar="--x" size="sm" />);
    expect(container.firstElementChild).toHaveClass("size-2.5");
  });
});

describe("Stat", () => {
  it("shows label, value, unit and note", () => {
    render(
      <dl>
        <Stat label="PM2.5" value={88} unit="µg/m³" note="5.9x WHO limit" />
      </dl>,
    );
    expect(screen.getByText("PM2.5")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("µg/m³")).toBeInTheDocument();
    expect(screen.getByText("5.9x WHO limit")).toBeInTheDocument();
  });
});
