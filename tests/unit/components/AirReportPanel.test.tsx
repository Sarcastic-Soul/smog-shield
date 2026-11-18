import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AirReportPanel } from "@/components/AirReportPanel";
import { buildInsights } from "@/lib/domain/insights";
import { delhiReport } from "../../fixtures/delhi";
import { healthyProfile, makeProfile } from "../../fixtures/profiles";

function setup(profile = makeProfile(), report = delhiReport()) {
  const insights = buildInsights(profile, report);
  render(<AirReportPanel report={report} insights={insights} />);
  return insights;
}

describe("AirReportPanel", () => {
  it("heads the section with the place, country and time", () => {
    setup();
    expect(screen.getByRole("region", { name: /Air now in New Delhi, India/ })).toBeInTheDocument();
    const heading = screen.getByRole("heading", { name: /Air now in New Delhi, India/ });
    expect(heading).toHaveTextContent("at 10:00");
  });

  it("leaves the country out when there is none", () => {
    const report = delhiReport();
    setup(makeProfile(), { ...report, place: { ...report.place, country: "" } });
    const heading = screen.getByRole("heading", { name: /^Air now in New Delhi/ });
    expect(heading).not.toHaveTextContent("India");
    expect(heading).toHaveTextContent("at 10:00");
  });

  it("shows the AQI, band and household risk", () => {
    setup();
    expect(screen.getByText("118")).toBeInTheDocument();
    expect(screen.getByText("Unhealthy for sensitive groups")).toBeInTheDocument();
    expect(screen.getByText("High risk for your home")).toBeInTheDocument();
  });

  it("colours the band dot from the band's CSS variable", () => {
    const { container } = render(
      <AirReportPanel report={delhiReport()} insights={buildInsights(makeProfile(), delhiReport())} />,
    );
    const dot = container.querySelector("span[aria-hidden].rounded-full") as HTMLElement;
    expect(dot.style.background).toContain("var(--aqi-sensitive)");
  });

  it("shows PM2.5 against the WHO limit, cigarettes and indoor levels", () => {
    const insights = setup();
    expect(screen.getByText(`${insights.timesWhoLimit}× the WHO daily limit of 15`)).toBeInTheDocument();
    expect(screen.getByText(String(insights.cigarettesPerDay), { exact: false })).toBeInTheDocument();
    expect(screen.getByText(`~${insights.indoor.indoorWithPurifier} with a HEPA purifier running`)).toBeInTheDocument();
    expect(screen.getByText("Inside, windows shut")).toBeInTheDocument();
  });

  it("states the outdoor rule and the other pollutants", () => {
    const insights = setup();
    expect(screen.getByText(new RegExp(insights.risk.outdoorRule.slice(0, 20)))).toBeInTheDocument();
    expect(screen.getByText(/PM10 140.3 · NO₂ 38.4 · Ozone 21.1 µg\/m³/)).toBeInTheDocument();
  });

  it.each([
    [40, "Low risk for your home"],
    [90, "Low risk for your home"],
    [260, "Severe risk for your home"],
  ])("shows the right risk copy at AQI %i for a healthy home", (aqi, copy) => {
    const report = delhiReport();
    setup(healthyProfile(), { ...report, now: { ...report.now, aqi } });
    expect(screen.getByText(copy)).toBeInTheDocument();
  });

  it("shows moderate risk for a healthy home at AQI 120", () => {
    const report = delhiReport();
    setup(healthyProfile(), { ...report, now: { ...report.now, aqi: 120 } });
    expect(screen.getByText("Moderate risk for your home")).toBeInTheDocument();
  });
});
