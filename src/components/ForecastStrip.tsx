import { bandFor, pm25ToAqi } from "@/lib/air/aqi";
import { hourOf, type HourlyAir } from "@/lib/air/types";
import type { AirWindow } from "@/lib/domain/windows";
import { clockLabel } from "@/lib/domain/windows";

interface Props {
  hours: HourlyAir[];
  windows: { best: AirWindow; worst: AirWindow } | null;
}

function inWindow(time: string, window: AirWindow | undefined): boolean {
  return Boolean(window && time >= window.start && time < window.end);
}

/**
 * 24-hour chart of hourly PM2.5, coloured by its AQI band. Bars are decorative; the same data is in a
 * visually hidden table so screen readers get exact values.
 */
export function ForecastStrip({ hours, windows }: Props) {
  if (hours.length === 0) return null;
  const peak = Math.max(...hours.map((h) => h.pm25), 60);

  return (
    <section aria-labelledby="forecast-title" className="border-b border-rule py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id="forecast-title" className="font-serif text-3xl tracking-tight">
          Next 24 hours
        </h2>
        <p className="w-full text-sm text-ink-muted md:order-last">
          Hourly PM2.5, coloured by AQI band. Plan outdoor time in the green-marked window.
        </p>
        {windows && (
          <p className="text-sm">
            <span className="mr-4 inline-flex items-center gap-2">
              <span aria-hidden className="inline-block h-2 w-5 bg-accent" />
              Cleanest {clockLabel(windows.best.start)}–{clockLabel(windows.best.end)} (PM2.5 {windows.best.avgPm25})
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="inline-block h-2 w-5 bg-alert" />
              Worst {clockLabel(windows.worst.start)}–{clockLabel(windows.worst.end)} (PM2.5 {windows.worst.avgPm25})
            </span>
          </p>
        )}
      </div>

      <div aria-hidden className="mt-6 flex h-40 items-end gap-[3px]">
        {hours.map((h) => {
          const best = inWindow(h.time, windows?.best);
          const worst = inWindow(h.time, windows?.worst);
          return (
            <div key={h.time} className="flex h-full flex-1 flex-col justify-end">
              <div
                className="w-full rounded-t-[2px]"
                style={{
                  height: `${Math.max(4, (h.pm25 / peak) * 100)}%`,
                  background: `var(${bandFor(pm25ToAqi(h.pm25)).colorVar})`,
                }}
                title={`${clockLabel(h.time)} PM2.5 ${h.pm25} µg/m³`}
              />
              <div className={`mt-1 h-1 w-full ${best ? "bg-accent" : worst ? "bg-alert" : "bg-transparent"}`} />
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-1 flex gap-[3px] font-mono text-[10px] text-ink-muted">
        {hours.map((h) => (
          <span key={h.time} className="flex-1 text-center">
            {hourOf(h.time) % 3 === 0 ? clockLabel(h.time).slice(0, 2) : ""}
          </span>
        ))}
      </div>

      <table className="sr-only">
        <caption>Hourly air forecast</caption>
        <thead>
          <tr>
            <th scope="col">Time</th>
            <th scope="col">PM2.5 µg/m³</th>
            <th scope="col">Hourly AQI</th>
          </tr>
        </thead>
        <tbody>
          {hours.map((h) => (
            <tr key={h.time}>
              <td>{clockLabel(h.time)}</td>
              <td>{h.pm25}</td>
              <td>{pm25ToAqi(h.pm25)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
