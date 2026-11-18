"use client";

import { useId, useState } from "react";
import { COMMUNITY_SCALES, communityImpact } from "@/lib/domain/impact";
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
  const [scaleId, setScaleId] = useState<(typeof COMMUNITY_SCALES)[number]["id"]>("home");
  const groupName = useId();
  const scaleSelectId = useId();

  const swap = swaps.find((s) => s.to === swapTo) ?? null;
  const scale = COMMUNITY_SCALES.find((s) => s.id === scaleId) ?? COMMUNITY_SCALES[0];
  const scaled = swap && scale.households > 1 ? communityImpact(swap, scale.households) : null;
  const { indoor, exercise, windows } = insights;
  const indoorNow = runPurifier ? indoor.indoorWithPurifier : indoor.indoorPm25;
  // On high-risk days the plan says to exercise indoors, so the simulator offers that instead.
  const exerciseIndoors = insights.risk.level === "high" || insights.risk.level === "severe";
  const shiftedDose = !exercise
    ? 0
    : !shiftExercise
      ? exercise.doseAtWorst
      : exerciseIndoors
        ? exercise.indoorDose
        : exercise.doseAtBest;

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
            {insights.commute.weeklyKm === 0
              ? "Your commute"
              : `Commute instead of ${COMMUTE_LABELS[profile.commute.mode].toLowerCase()}`}
          </legend>
          {swaps.length === 0 ? (
            <p className="text-sm text-ink-muted">
              {insights.commute.weeklyKm === 0
                ? "No commute emissions this week, so there is nothing to swap."
                : "Your commute is already low emission."}
            </p>
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
            <>
              <label htmlFor={scaleSelectId} className="mt-4 mb-1 block text-sm">
                How many homes make this change?
              </label>
              <select
                id={scaleSelectId}
                className="field"
                value={scaleId}
                onChange={(e) => setScaleId(e.target.value as typeof scaleId)}
              >
                {COMMUNITY_SCALES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <output className="mt-4 block border-t border-ink pt-3" aria-live="polite">
                {scaled ? (
                  <>
                    <span className="block font-serif text-4xl tabular-nums">{scaled.co2TonnesPerYear} t</span>
                    <span className="text-sm">
                      CO₂ saved a year by {scaled.households.toLocaleString("en-IN")} homes, about{" "}
                      {Math.round((scaled.co2TonnesPerYear * 1000) / TREE_KG_CO2_PER_YEAR).toLocaleString("en-IN")}{" "}
                      trees&apos; worth, and {scaled.pm25KgPerYear} kg less tailpipe soot in your area.
                    </span>
                  </>
                ) : (
                  <>
                    <span className="block font-serif text-4xl tabular-nums">{swap.co2KgSavedPerYear} kg</span>
                    <span className="text-sm">
                      CO₂ saved a year ({swap.co2KgSavedPerWeek} kg a week), what about{" "}
                      {Math.max(1, Math.round(swap.co2KgSavedPerYear / TREE_KG_CO2_PER_YEAR))} trees take up in a year.
                      Plus {swap.pm25GramsSavedPerWeek} g less tailpipe soot on your streets each week.
                    </span>
                  </>
                )}
              </output>
            </>
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
                {exerciseIndoors
                  ? `Do my ${exercise.minutes}-min exercise indoors, purifier on`
                  : `Move my ${exercise.minutes}-min walk to ${clockLabel(windows.best.start)}`}
              </label>
              <output className="mt-4 block border-t border-ink pt-3" aria-live="polite">
                <span className="block font-serif text-4xl tabular-nums">{shiftedDose} µg</span>
                <span className="text-sm">
                  of PM2.5 breathed in
                  {shiftExercise
                    ? ` — ${Math.round((1 - shiftedDose / Math.max(1, exercise.doseAtWorst)) * 100)}% less than outside at ${clockLabel(windows.worst.start)}.`
                    : ` exercising outside at the worst hour, ${clockLabel(windows.worst.start)}.`}
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
