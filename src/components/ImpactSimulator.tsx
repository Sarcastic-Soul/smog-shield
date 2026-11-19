"use client";

import { useId, useState } from "react";
import { clockOf } from "@/lib/air/types";
import {
  COMMUNITY_SCALE_IDS,
  COMMUNITY_SCALES,
  communityImpact,
  communityScaleLabel,
  treesEquivalent,
  type CommunityScaleId,
} from "@/lib/domain/emissions";
import { cutPercent, simulatedExerciseDose } from "@/lib/domain/exposure";
import type { Insights } from "@/lib/domain/insights";
import { COMMUTE_LABELS, type Profile } from "@/lib/domain/profile-options";
import { isHighRisk } from "@/lib/domain/risk";
import { inSentence } from "@/lib/domain/rules/text";
import { CheckboxField, CHOICE_INPUT_CLASS, SelectField } from "@/components/form/fields";

const SCALE_LABELS: Record<CommunityScaleId, string> = {
  home: communityScaleLabel("home"),
  building: communityScaleLabel("building"),
  ward: communityScaleLabel("ward"),
};

interface Props {
  profile: Profile;
  insights: Insights;
}

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
  const [scaleId, setScaleId] = useState<CommunityScaleId>("home");
  const groupName = useId();

  const swap = swaps.find((s) => s.to === swapTo) ?? null;
  const { households } = COMMUNITY_SCALES[scaleId];
  const scaled = swap && households > 1 ? communityImpact(swap, households) : null;

  return (
    <fieldset>
      <legend className="mb-3 font-medium">
        {weeklyKm === 0 ? "Your commute" : `Commute instead of ${inSentence(COMMUTE_LABELS[profile.commute.mode])}`}
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
                className={CHOICE_INPUT_CLASS}
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
          <div className="mt-4">
            <SelectField
              label="How many homes make this change?"
              value={scaleId}
              options={COMMUNITY_SCALE_IDS}
              labels={SCALE_LABELS}
              onChange={setScaleId}
            />
          </div>
          {scaled ? (
            <Result value={`${scaled.co2TonnesPerYear} t`}>
              CO₂ saved a year by {scaled.households.toLocaleString("en-IN")} homes, as much as{" "}
              {scaled.trees.toLocaleString("en-IN")} trees take up, and {scaled.pm25KgPerYear} kg less tailpipe soot in
              your area.
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
  const indoors = isHighRisk(risk.level);
  const dose = simulatedExerciseDose(exercise, shift ? (indoors ? "indoors" : "best") : "worst");
  return (
    <div>
      <CheckboxField
        label={
          indoors
            ? `Do my ${exercise.minutes}-min exercise indoors, purifier on`
            : `Move my ${exercise.minutes}-min walk to ${clockOf(windows.best.start)}`
        }
        checked={shift}
        onChange={setShift}
        textClassName="font-medium"
      />
      <Result value={`${dose} µg`}>
        of PM2.5 breathed in
        {shift
          ? ` — ${cutPercent(exercise.doseAtWorst, dose)}% less than outside at ${clockOf(windows.worst.start)}.`
          : ` exercising outside at the worst hour, ${clockOf(windows.worst.start)}.`}
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
