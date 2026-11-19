import { WHO_PM25_24H } from "@/lib/air/aqi";
import { clockOf, POLLUTANT_LABELS, type AirReport } from "@/lib/air/types";
import type { Insights } from "@/lib/domain/insights";
import { BandDot, Stat } from "./ui";

const RISK_COPY = {
  low: "Low risk for your home",
  moderate: "Moderate risk for your home",
  high: "High risk for your home",
  severe: "Severe risk for your home",
} as const;

export function AirReportPanel({ report, insights }: { report: AirReport; insights: Insights }) {
  const { place, now } = report;

  return (
    <section
      aria-labelledby="air-now-title"
      className="grid gap-8 border-b border-rule pb-10 md:grid-cols-[auto_1fr] md:gap-x-12 md:gap-y-4"
    >
      <div>
        <h2 id="air-now-title" className="text-base font-medium">
          Air now in {place.name}
          {place.country ? `, ${place.country}` : ""}
          <span className="ml-2 font-mono text-sm font-normal text-ink-muted">at {clockOf(now.time)}</span>
        </h2>
        <p className="mt-2 flex items-baseline gap-3">
          <span className="font-serif text-[7rem] leading-none tracking-tighter tabular-nums md:text-[9rem]">
            {now.aqi}
          </span>
          <span className="font-mono text-sm text-ink-muted">US AQI</span>
        </p>
        <p className="mt-3 flex items-center gap-2 text-lg">
          <BandDot colorVar={insights.band.colorVar} />
          {insights.band.label}
        </p>
        <p className="mt-1 font-medium">{RISK_COPY[insights.risk.level]}</p>
      </div>

      <dl className="grid content-end gap-x-8 gap-y-6 sm:grid-cols-3">
        <Stat
          label="PM2.5"
          value={now.pm25}
          unit="µg/m³"
          note={`${insights.timesWhoLimit}× the WHO daily limit of ${WHO_PM25_24H}`}
        />
        <Stat
          label="Like smoking"
          value={insights.cigarettesPerDay}
          unit="cigarettes"
          note="a day, if you breathe this air for 24 hours"
        />
        <Stat
          label="Inside, windows shut"
          value={`~${insights.indoor.indoorPm25}`}
          unit="µg/m³"
          note={`~${insights.indoor.indoorWithPurifier} with a HEPA purifier running`}
        />
      </dl>
      <p className="text-sm text-ink-muted md:col-start-2">
        {insights.risk.outdoorRule} Main pollutant: {POLLUTANT_LABELS[now.dominant]}. PM10 {now.pm10} · NO₂ {now.no2} ·
        Ozone {now.ozone} µg/m³.
      </p>
    </section>
  );
}
