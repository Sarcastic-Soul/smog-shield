import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ForecastStrip } from "@/components/ForecastStrip";
import { buildInsights, type Trend } from "@/lib/domain/insights";
import { delhiReport } from "../../fixtures/delhi";
import { makeProfile } from "../../fixtures/profiles";

const report = delhiReport();
const insights = buildInsights(makeProfile(), report);

function setup(overrides: Partial<React.ComponentProps<typeof ForecastStrip>> = {}) {
  return render(
    <ForecastStrip
      hours={report.next24h}
      windows={insights.windows}
      outlook={insights.outlook}
      nowTime={report.now.time}
      {...overrides}
    />,
  );
}

describe("ForecastStrip", () => {
  it("renders nothing when there are no hours", () => {
    const { container } = setup({ hours: [] });
    expect(container).toBeEmptyDOMElement();
  });

  it("names the cleanest and worst windows", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Next 24 hours" })).toBeInTheDocument();
    expect(screen.getByText(/Cleanest 12:00–14:00 \(PM2.5 45.5\)/)).toBeInTheDocument();
    expect(screen.getByText(/Worst 19:00–21:00 \(PM2.5 119\)/)).toBeInTheDocument();
  });

  it("says tomorrow when a window falls on the next day", () => {
    const next = {
      best: { start: "2026-01-16T07:00", end: "2026-01-16T09:00", avgAqi: 50, avgPm25: 12 },
      worst: insights.windows!.worst,
    };
    setup({ windows: next });
    expect(screen.getByText(/Cleanest tomorrow 07:00–09:00/)).toBeInTheDocument();
  });

  it("omits the window legend when there are no windows", () => {
    setup({ windows: null });
    expect(screen.queryByText(/Cleanest/)).not.toBeInTheDocument();
  });

  it("gives screen readers a table with one row per hour", () => {
    setup();
    const table = screen.getByRole("table", { name: "Hourly air forecast" });
    expect(table).toHaveClass("sr-only");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(report.next24h.length + 1);
    expect(
      within(rows[1])
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["10:00", "62", "156"]);
  });

  it("hides the bars from screen readers", () => {
    const { container } = setup();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it("shows the next few days with weekday, PM2.5 and band", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Next few days" })).toBeInTheDocument();
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Fri");
    expect(items[0]).toHaveTextContent("88.6");
    expect(items[0]).toHaveTextContent("µg/m³ · Unhealthy");
    expect(items[1]).toHaveTextContent("Sat");
    expect(items[2]).toHaveTextContent("Sun");
  });

  it.each<[Trend, RegExp]>([
    ["worsening", /Smog is building/],
    ["steady", /Similar air/],
    ["improving", /Air should improve/],
  ])("explains a %s trend", (trend, text) => {
    setup({ outlook: { days: insights.outlook.days, trend } });
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("hides the outlook section when there are no days", () => {
    setup({ outlook: { days: [], trend: "steady" } });
    expect(screen.queryByRole("heading", { name: "Next few days" })).not.toBeInTheDocument();
  });

  it("labels every third hour on the axis", () => {
    const { container } = setup();
    const labels = [...container.querySelectorAll(".font-mono.text-xs span")].map((s) => s.textContent).filter(Boolean);
    expect(labels).toEqual(["12", "15", "18", "21", "00", "03", "06", "09"]);
  });
});
