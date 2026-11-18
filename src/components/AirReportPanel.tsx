import { bandFor, WHO_PM25_24H } from "@/lib/air/aqi";
import type { AirReport } from "@/lib/air/types";
import type { Insights } from "@/lib/domain/insights";
import { clockLabel } from "@/lib/domain/windows";

const RISK_COPY = {
  low: "Low risk for your home",
  moderate: "Moderate risk for your home",
  high: "High risk for your home",
  severe: "Severe risk for your home",
} as const;

export function AirReportPanel({ report, insights }: { report: AirReport; insights: Insights }) {
  const band = bandFor(report.now.aqi);
  const { place, now } = report;

  return (
    <section aria-labelledby="air-now-title" className="grid gap-8 border-b border-rule pb-10 md:grid-cols-[auto_1fr] md:gap-12">
      <div>
        <h2 id="air-now-title" className="font-mono text-xs uppercase tracking-[0.12em] text-ink-muted">
          Air now · {place.name}
          {place.country ? `, ${place.country}` : ""} · {clockLabel(now.time)}
        </h2>
        <p className="mt-2 flex items-baseline gap-3">
          <span className="font-serif text-[7rem] leading-none tracking-tighter tabular-nums md:text-[9rem]">{now.aqi}</span>
          <span className="font-mono text-sm text-ink-muted">US AQI</span>
        </p>
        <p className="mt-3 flex items-center gap-2 text-lg">
          <span aria-hidden className="inline-block size-3 rounded-full" style={{ background: `var(${band.colorVar})` }} />
          {band.label}
        </p>
        <p className="mt-1 font-medium">{RISK_COPY[insights.risk.level]}</p>
      </div>

      <dl className="grid content-end gap-x-8 gap-y-6 sm:grid-cols-3">
        <div className="border-t border-ink pt-3">
          <dt className="text-sm text-ink-muted">PM2.5</dt>
          <dd className="font-serif text-4xl tabular-nums">
            {now.pm25}
            <span className="ml-1 font-sans text-sm text-ink-muted">µg/m³</span>
          </dd>
          <dd className="text-sm">{insights.timesWhoLimit}× the WHO daily limit of {WHO_PM25_24H}</dd>
        </div>
        <div className="border-t border-ink pt-3">
          <dt className="text-sm text-ink-muted">Like smoking</dt>
          <dd className="font-serif text-4xl tabular-nums">
            {insights.cigarettesPerDay}
            <span className="ml-1 font-sans text-sm text-ink-muted">cigarettes</span>
          </dd>
          <dd className="text-sm">a day, if you breathe this air for 24 hours</dd>
        </div>
        <div className="border-t border-ink pt-3">
          <dt className="text-sm text-ink-muted">Inside, windows shut</dt>
          <dd className="font-serif text-4xl tabular-nums">
            ~{insights.indoor.indoorPm25}
            <span className="ml-1 font-sans text-sm text-ink-muted">µg/m³</span>
          </dd>
          <dd className="text-sm">~{insights.indoor.indoorWithPurifier} with a HEPA purifier running</dd>
        </div>
      </dl>
      <p className="text-sm text-ink-muted md:col-start-2">
        {insights.risk.outdoorRule} PM10 {now.pm10} · NO₂ {now.no2} · Ozone {now.ozone} µg/m³.
      </p>
    </section>
  );
}
