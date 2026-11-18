"use client";

import { useId, useState } from "react";
import type { Insights } from "@/lib/domain/insights";
import { COMMUTE_LABELS, type Profile } from "@/lib/domain/profile";
import { clockLabel } from "@/lib/domain/windows";

/** A mature tree takes up roughly 21 kg of CO2 a year (European Environment Agency). */
const TREE_KG_CO2_PER_YEAR = 21;

interface Props {
  profile: Profile;
  insights: Insights;
}

/**
 * Lets the family try choices and see the effect straight away. Pure maths on
 * numbers the server already computed, so it costs no extra requests.
 */
export function ImpactSimulator({ profile, insights }: Props) {
  const swaps = insights.commute.swaps;
  const [swapTo, setSwapTo] = useState(swaps[0]?.to ?? null);
  const [runPurifier, setRunPurifier] = useState(true);
  const [shiftExercise, setShiftExercise] = useState(true);
  const groupName = useId();

  const swap = swaps.find((s) => s.to === swapTo) ?? null;
  const { indoor, exercise, windows } = insights;
  const indoorNow = runPurifier ? indoor.indoorWithPurifier : indoor.indoorPm25;

  return (
    <section aria-labelledby="impact-title" className="border-b border-rule py-10">
      <h2 id="impact-title" className="font-serif text-3xl tracking-tight">
        Try a change, see the effect
      </h2>
      <p className="mt-2 max-w-2xl text-ink-muted">
        Estimates from published emission and exposure factors. They show the size of a choice, not an exact
        measurement.
      </p>

      <div className="mt-8 grid gap-10 md:grid-cols-3">
        <fieldset>
          <legend className="mb-3 font-medium">
            Commute instead of {COMMUTE_LABELS[profile.commute.mode].toLowerCase()}
          </legend>
          {swaps.length === 0 ? (
            <p className="text-sm text-ink-muted">Your commute is already low emission.</p>
          ) : (
            <div className="space-y-1">
              {swaps.map((s) => (
                <label key={s.to} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="radio"
                    name={groupName}
                    className="size-4 accent-[var(--accent)]"
                    checked={swapTo === s.to}
                    onChange={() => setSwapTo(s.to)}
                  />
                  {COMMUTE_LABELS[s.to]}
                </label>
              ))}
            </div>
          )}
          {swap && (
            <output className="mt-4 block border-t border-ink pt-3" aria-live="polite">
              <span className="block font-serif text-4xl tabular-nums">{swap.co2KgSavedPerYear} kg</span>
              <span className="text-sm">
                CO₂ saved a year ({swap.co2KgSavedPerWeek} kg a week) — what about{" "}
                {Math.max(1, Math.round(swap.co2KgSavedPerYear / TREE_KG_CO2_PER_YEAR))} trees take up in a year.
                Plus {swap.pm25GramsSavedPerWeek} g less tailpipe soot on your streets each week.
              </span>
            </output>
          )}
        </fieldset>

        <div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 font-medium">
            <input
              type="checkbox"
              className="size-4 accent-[var(--accent)]"
              checked={runPurifier}
              onChange={(e) => setRunPurifier(e.target.checked)}
            />
            Run a HEPA purifier, door shut
          </label>
          <output className="mt-4 block border-t border-ink pt-3" aria-live="polite">
            <span className="block font-serif text-4xl tabular-nums">~{indoorNow} µg/m³</span>
            <span className="text-sm">
              indoor PM2.5{" "}
              {runPurifier
                ? `— ${indoor.purifierCutPercent}% below the ~${indoor.indoorPm25} you would breathe with windows shut alone.`
                : `with windows shut. Outdoors it is ${indoor.outdoorPm25}.`}
            </span>
          </output>
        </div>

        <div>
          {exercise && windows ? (
            <>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 font-medium">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={shiftExercise}
                  onChange={(e) => setShiftExercise(e.target.checked)}
                />
                Move my {exercise.minutes}-min walk to {clockLabel(windows.best.start)}
              </label>
              <output className="mt-4 block border-t border-ink pt-3" aria-live="polite">
                <span className="block font-serif text-4xl tabular-nums">
                  {shiftExercise ? exercise.doseAtBest : exercise.doseAtWorst} µg
                </span>
                <span className="text-sm">
                  of PM2.5 breathed in
                  {shiftExercise
                    ? ` — ${exercise.cutPercent}% less than at ${clockLabel(windows.worst.start)}. Indoors with a purifier: ${exercise.indoorDose} µg.`
                    : ` at the worst hour, ${clockLabel(windows.worst.start)}.`}
                </span>
              </output>
            </>
          ) : (
            <p className="text-sm text-ink-muted">Add daily outdoor minutes to compare walk times.</p>
          )}
        </div>
      </div>
    </section>
  );
}
