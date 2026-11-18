"use client";

import { useId, useState } from "react";
import {
  COMMUNITY_SCALES,
  communityImpact,
  cutPercent,
  simulatedExerciseDose,
  treesEquivalent,
} from "@/lib/domain/impact";
import type { Insights } from "@/lib/domain/insights";
import { COMMUTE_LABELS, type Profile } from "@/lib/domain/profile-options";
import { clockLabel } from "@/lib/domain/windows";
import { CheckboxField } from "./form/fields";

interface Props {
  profile: Profile;
  insights: Insights;
}

type ScaleId = (typeof COMMUNITY_SCALES)[number]["id"];

function Result({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <output className="mt-4 block border-t border-ink pt-3" aria-live="polite">
      <span className="block font-serif text-4xl tabular-nums">{value}</span>
      <span className="text-sm">{children}</span>
    </output>
  );
}

function CommuteChoice({ profile, insights }: Props) {
  const { swaps, weeklyKm } = insights.commute;
  const [swapTo, setSwapTo] = useState(swaps[0]?.to ?? null);
  const [scaleId, setScaleId] = useState<ScaleId>("home");
  const groupName = useId();
  const scaleSelectId = useId();

  const swap = swaps.find((s) => s.to === swapTo) ?? null;
  const scale = COMMUNITY_SCALES.find((s) => s.id === scaleId) ?? COMMUNITY_SCALES[0];
  const scaled = swap && scale.households > 1 ? communityImpact(swap, scale.households) : null;

  return (
    <fieldset>
      <legend className="mb-3 font-medium">
        {weeklyKm === 0 ? "Your commute" : `Commute instead of ${COMMUTE_LABELS[profile.commute.mode].toLowerCase()}`}
      </legend>
      {swaps.length === 0 ? (
        <p className="text-sm text-ink-muted">
          {weeklyKm === 0
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
          <label htmlFor={scaleSelectId} className="mb-1 mt-4 block text-sm">
            How many homes make this change?
          </label>
          <select
            id={scaleSelectId}
            className="field"
            value={scaleId}
            onChange={(e) => setScaleId(e.target.value as ScaleId)}
          >
            {COMMUNITY_SCALES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          {scaled ? (
            <Result value={`${scaled.co2TonnesPerYear} t`}>
              CO₂ saved a year by {scaled.households.toLocaleString("en-IN")} homes, as much as{" "}
              {treesEquivalent(scaled.co2TonnesPerYear * 1000).toLocaleString("en-IN")} trees take up, and{" "}
              {scaled.pm25KgPerYear} kg less tailpipe soot in your area.
            </Result>
          ) : (
            <Result value={`${swap.co2KgSavedPerYear} kg`}>
              CO₂ saved a year ({swap.co2KgSavedPerWeek} kg a week), as much as{" "}
              {treesEquivalent(swap.co2KgSavedPerYear)} trees take up in a year. Plus {swap.pm25GramsSavedPerWeek} g
              less tailpipe soot on your streets each week.
            </Result>
          )}
        </>
      )}
    </fieldset>
  );
}

function PurifierChoice({ insights }: { insights: Insights }) {
  const [runPurifier, setRunPurifier] = useState(true);
  const { indoor } = insights;
  return (
    <div>
      <CheckboxField
        label="Run a HEPA purifier, door shut"
        checked={runPurifier}
        onChange={setRunPurifier}
        textClassName="font-medium"
      />
      <Result value={`~${runPurifier ? indoor.indoorWithPurifier : indoor.indoorPm25} µg/m³`}>
        indoor PM2.5{" "}
        {runPurifier
          ? `— ${indoor.purifierCutPercent}% below the ~${indoor.indoorPm25} you would breathe with windows shut alone.`
          : `with windows shut. Outdoors it is ${indoor.outdoorPm25}.`}
      </Result>
    </div>
  );
}

function ExerciseChoice({ insights }: { insights: Insights }) {
  const [shift, setShift] = useState(true);
  const { exercise, windows, risk } = insights;
  if (!exercise || !windows) {
    return <p className="text-sm text-ink-muted">Add daily outdoor minutes to compare walk times.</p>;
  }
  // On high-risk days the plan says to exercise indoors, so the simulator offers that instead.
  const indoors = risk.level === "high" || risk.level === "severe";
  const dose = simulatedExerciseDose(exercise, shift ? (indoors ? "indoors" : "best") : "worst");
  return (
    <div>
      <CheckboxField
        label={
          indoors
            ? `Do my ${exercise.minutes}-min exercise indoors, purifier on`
            : `Move my ${exercise.minutes}-min walk to ${clockLabel(windows.best.start)}`
        }
        checked={shift}
        onChange={setShift}
        textClassName="font-medium"
      />
      <Result value={`${dose} µg`}>
        of PM2.5 breathed in
        {shift
          ? ` — ${cutPercent(exercise.doseAtWorst, dose)}% less than outside at ${clockLabel(windows.worst.start)}.`
          : ` exercising outside at the worst hour, ${clockLabel(windows.worst.start)}.`}
      </Result>
    </div>
  );
}

/**
 * Lets the family try choices and see the effect straight away. All numbers
 * come from the server's insights and domain helpers, so it costs no requests.
 */
export function ImpactSimulator({ profile, insights }: Props) {
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
        <CommuteChoice profile={profile} insights={insights} />
        <PurifierChoice insights={insights} />
        <ExerciseChoice insights={insights} />
      </div>
    </section>
  );
}
