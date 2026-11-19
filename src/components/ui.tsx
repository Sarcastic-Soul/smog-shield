import type { ReactNode } from "react";

/* Small presentational pieces shared by several result panels. */

/** A coloured dot for an AQI band. Decorative: the band name is always shown next to it. */
export function BandDot({ colorVar, size = "md" }: { colorVar: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden
      className={`inline-block rounded-full ${size === "sm" ? "size-2.5" : "size-3"}`}
      style={{ background: `var(${colorVar})` }}
    />
  );
}

interface StatProps {
  label: string;
  value: ReactNode;
  unit: string;
  /** One line explaining what the number means. */
  note: ReactNode;
}

/** A labelled headline number for a `<dl>`, e.g. PM2.5 with its WHO multiple. */
export function Stat({ label, value, unit, note }: StatProps) {
  return (
    <div className="border-t border-ink pt-3">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="font-serif text-4xl tabular-nums">
        {value}
        <span className="ml-1 font-sans text-sm text-ink-muted">{unit}</span>
      </dd>
      <dd className="text-sm">{note}</dd>
    </div>
  );
}
