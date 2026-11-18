import { bandFor, pm25ToAqi } from "@/lib/air/aqi";
import { hourOf, type DailyOutlook, type HourlyAir } from "@/lib/air/types";
import type { Trend } from "@/lib/domain/insights";
import { clockLabel, dayOf, type AirWindow } from "@/lib/domain/windows";

interface Props {
  hours: HourlyAir[];
  windows: { best: AirWindow; worst: AirWindow } | null;
  outlook: { days: DailyOutlook[]; trend: Trend };
  nowTime: string;
}

const TREND_COPY: Record<Trend, string> = {
  worsening: "Smog is building over the next days. Stock up on N95s and plan indoor time.",
  steady: "Similar air for the next few days.",
  improving: "Air should improve over the next days.",
};

function inWindow(time: string, window: AirWindow | undefined): boolean {
  return Boolean(window && time >= window.start && time < window.end);
}

function windowLabel(window: AirWindow, nowTime: string): string {
  const day = dayOf(window.start, nowTime) === "tomorrow" ? "tomorrow " : "";
  return `${day}${clockLabel(window.start)}–${clockLabel(window.end)}`;
}

function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
}

/**
 * 24-hour chart of hourly PM2.5, coloured by its AQI band, plus a three-day
 * outlook. Bars are decorative; the same data is in a visually hidden table.
 */
export function ForecastStrip({ hours, windows, outlook, nowTime }: Props) {
  if (hours.length === 0) return null;
  const peak = Math.max(...hours.map((h) => h.pm25), 60);

  return (
    <section aria-labelledby="forecast-title" className="border-b border-rule py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <h2 id="forecast-title" className="font-serif text-3xl tracking-tight">
          Next 24 hours
        </h2>
        {windows && (
          <p className="text-sm">
            <span className="mr-4 inline-flex items-center gap-2">
              <span aria-hidden className="inline-block h-2 w-5 bg-accent" />
              Cleanest {windowLabel(windows.best, nowTime)} (PM2.5 {windows.best.avgPm25})
            </span>
            <span className="inline-flex items-center gap-2">
              <span aria-hidden className="inline-block h-2 w-5 bg-alert" />
              Worst {windowLabel(windows.worst, nowTime)} (PM2.5 {windows.worst.avgPm25})
            </span>
          </p>
        )}
        <p className="w-full text-sm text-ink-muted md:order-last">
          Hourly PM2.5, coloured by AQI band. Plan outdoor time in the green-marked window.
        </p>
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
      <div aria-hidden className="mt-1 flex gap-[3px] font-mono text-xs text-ink-muted">
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

      {outlook.days.length > 0 && (
        <div className="mt-8">
          <h3 className="font-medium">Next few days</h3>
          <p className="text-sm text-ink-muted">{TREND_COPY[outlook.trend]}</p>
          <ul className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-rule bg-rule sm:max-w-md">
            {outlook.days.map((day) => (
              <li key={day.date} className="bg-paper-raised p-3">
                <p className="font-mono text-xs text-ink-muted">{weekday(day.date)}</p>
                <p className="flex items-center gap-2 font-serif text-2xl tabular-nums">
                  <span
                    aria-hidden
                    className="inline-block size-2.5 rounded-full"
                    style={{ background: `var(${bandFor(day.aqi).colorVar})` }}
                  />
                  {day.avgPm25}
                </p>
                <p className="text-xs">µg/m³ · {bandFor(day.aqi).label}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
