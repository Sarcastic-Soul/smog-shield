import { bandFor, pm25ToAqi } from "@/lib/air/aqi";
import { clockOf, hourOf, type DailyOutlook, type HourlyAir } from "@/lib/air/types";
import type { Trend } from "@/lib/domain/insights";
import { dayOf, type AirWindow } from "@/lib/domain/windows";
import { BandDot } from "./ui";

interface Props {
  hours: HourlyAir[];
  windows: { best: AirWindow; worst: AirWindow } | null;
  outlook: { days: DailyOutlook[]; trend: Trend };
  nowTime: string;
}

/** Above this daily AQI a rising trend is a smog episode worth preparing for. */
const EPISODE_AQI = 100;

function trendCopy(trend: Trend, days: DailyOutlook[]): string {
  const worst = Math.max(...days.map((d) => d.aqi));
  if (trend === "worsening") {
    return worst > EPISODE_AQI
      ? "Smog is building over the next days. Stock up on N95s and plan indoor time."
      : "A little more pollution later in the week, still at a moderate level.";
  }
  if (trend === "improving") return "Air should improve over the next days.";
  return worst > EPISODE_AQI
    ? "Polluted air is likely to stay for the next few days."
    : "Similar air for the next few days.";
}

/** Keeps clean days readable: the chart's y-axis never tops out below this PM2.5. */
const MIN_CHART_PEAK_PM25 = 60;
/** Smallest bar height, so a near-zero hour is still visible. */
const MIN_BAR_PERCENT = 4;

function inWindow(time: string, window: AirWindow): boolean {
  return time >= window.start && time < window.end;
}

/** Green under the cleanest window, red under the worst, nothing elsewhere. */
function windowMarkClass(time: string, windows: Props["windows"]): string {
  if (windows && inWindow(time, windows.best)) return "bg-accent";
  if (windows && inWindow(time, windows.worst)) return "bg-alert";
  return "bg-transparent";
}

function windowLabel(window: AirWindow, nowTime: string): string {
  return `${dayOf(window.start, nowTime)} ${clockOf(window.start)}–${clockOf(window.end)}`;
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
  const peak = Math.max(...hours.map((h) => h.pm25), MIN_CHART_PEAK_PM25);

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
          return (
            <div key={h.time} className="flex h-full flex-1 flex-col justify-end">
              <div
                className="w-full rounded-t-[2px]"
                style={{
                  height: `${Math.max(MIN_BAR_PERCENT, (h.pm25 / peak) * 100)}%`,
                  background: `var(${bandFor(pm25ToAqi(h.pm25)).colorVar})`,
                }}
                title={`${clockOf(h.time)} PM2.5 ${h.pm25} µg/m³`}
              />
              <div className={`mt-1 h-1 w-full ${windowMarkClass(h.time, windows)}`} />
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-1 flex gap-[3px] font-mono text-xs text-ink-muted">
        {hours.map((h) => (
          <span key={h.time} className="flex-1 text-center">
            {hourOf(h.time) % 3 === 0 ? String(hourOf(h.time)).padStart(2, "0") : ""}
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
              <td>{clockOf(h.time)}</td>
              <td>{h.pm25}</td>
              <td>{pm25ToAqi(h.pm25)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {outlook.days.length > 0 && (
        <div className="mt-8">
          <h3 className="font-medium">Next few days</h3>
          <p className="text-sm text-ink-muted">{trendCopy(outlook.trend, outlook.days)}</p>
          <ul className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-rule bg-rule sm:max-w-md">
            {outlook.days.map((day) => (
              <li key={day.date} className="bg-paper-raised p-3">
                <p className="font-mono text-xs text-ink-muted">{weekday(day.date)}</p>
                <p className="flex items-center gap-2 font-serif text-2xl tabular-nums">
                  <BandDot colorVar={bandFor(day.aqi).colorVar} size="sm" />
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
