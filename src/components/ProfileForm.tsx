"use client";

import { ArrowRight, CircleNotch } from "@phosphor-icons/react";
import { useId, type FormEvent } from "react";
import {
  BUDGETS,
  COMMUTE_LABELS,
  COMMUTE_MODES,
  CONDITION_LABELS,
  COOKING_FUELS,
  COOKING_LABELS,
  HEALTH_CONDITIONS,
  HEATING_LABELS,
  HEATING_TYPES,
  type HealthCondition,
  type Profile,
} from "@/lib/domain/profile";

interface Props {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onSubmit: () => void;
  busy: boolean;
}

const BUDGET_LABELS = { low: "Tight", medium: "Some room", high: "Comfortable" } as const;

function Legend({ children }: { children: React.ReactNode }) {
  return (
    <legend className="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-ink-muted">{children}</legend>
  );
}

function NumberField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm">
        {props.label}
        {props.suffix ? <span className="text-ink-muted"> ({props.suffix})</span> : null}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        className="field tabular-nums"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) props.onChange(Math.min(props.max, Math.max(props.min, next)));
        }}
      />
    </div>
  );
}

function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm">
        {props.label}
      </label>
      <select id={id} className="field" value={props.value} onChange={(e) => props.onChange(e.target.value as T)}>
        {props.options.map((option) => (
          <option key={option} value={option}>
            {props.labels[option]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ProfileForm({ profile, onChange, onSubmit, busy }: Props) {
  const cityId = useId();
  const notesId = useId();
  const notesHintId = useId();

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => onChange({ ...profile, [key]: value });
  const setHousehold = (patch: Partial<Profile["household"]>) =>
    set("household", { ...profile.household, ...patch });
  const setCommute = (patch: Partial<Profile["commute"]>) => set("commute", { ...profile.commute, ...patch });
  const setHome = (patch: Partial<Profile["home"]>) => set("home", { ...profile.home, ...patch });

  const toggleCondition = (condition: HealthCondition, on: boolean) =>
    setHousehold({
      conditions: on
        ? [...profile.household.conditions, condition]
        : profile.household.conditions.filter((c) => c !== condition),
    });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form onSubmit={handleSubmit} aria-label="Your household" className="space-y-8">
      <div>
        <label htmlFor={cityId} className="mb-1 block font-serif text-2xl tracking-tight">
          Where do you live?
        </label>
        <input
          id={cityId}
          name="city"
          className="field text-lg"
          value={profile.city}
          onChange={(e) => set("city", e.target.value)}
          autoComplete="address-level2"
          required
          minLength={2}
          maxLength={80}
          placeholder="e.g. Lahore, Delhi, Lucknow"
        />
      </div>

      <fieldset>
        <Legend>Who lives at home</Legend>
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Adults" value={profile.household.adults} min={1} max={12} onChange={(adults) => setHousehold({ adults })} />
          <NumberField label="Children" value={profile.household.children} min={0} max={12} onChange={(children) => setHousehold({ children })} />
          <NumberField label="Over 65" value={profile.household.seniors} min={0} max={12} onChange={(seniors) => setHousehold({ seniors })} />
        </div>
        <p className="mb-2 mt-4 text-sm">Health conditions at home</p>
        <div className="flex flex-wrap gap-2">
          {HEALTH_CONDITIONS.map((condition) => {
            const checked = profile.household.conditions.includes(condition);
            return (
              <label
                key={condition}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors ${
                  checked ? "border-accent bg-accent-soft" : "border-rule hover:border-ink-muted"
                }`}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent)]"
                  checked={checked}
                  onChange={(e) => toggleCondition(condition, e.target.checked)}
                />
                {CONDITION_LABELS[condition]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <Legend>Daily commute</Legend>
        <SelectField
          label="Main way to work or school"
          value={profile.commute.mode}
          options={COMMUTE_MODES}
          labels={COMMUTE_LABELS}
          onChange={(mode) => setCommute({ mode })}
        />
        {profile.commute.mode !== "work_from_home" && (
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="One way" suffix="km" value={profile.commute.distanceKm} min={0} max={150} step={0.5} onChange={(distanceKm) => setCommute({ distanceKm })} />
            <NumberField label="Days a week" value={profile.commute.daysPerWeek} min={0} max={7} onChange={(daysPerWeek) => setCommute({ daysPerWeek })} />
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3">
        <Legend>Home</Legend>
        <SelectField label="Cooking fuel" value={profile.home.cooking} options={COOKING_FUELS} labels={COOKING_LABELS} onChange={(cooking) => setHome({ cooking })} />
        <SelectField label="Winter heating" value={profile.home.heating} options={HEATING_TYPES} labels={HEATING_LABELS} onChange={(heating) => setHome({ heating })} />
        <NumberField
          label="Outdoor walk or exercise"
          suffix="min a day"
          value={profile.home.outdoorExerciseMinutes}
          min={0}
          max={240}
          step={5}
          onChange={(outdoorExerciseMinutes) => setHome({ outdoorExerciseMinutes })}
        />
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent)]"
            checked={profile.home.hasPurifier}
            onChange={(e) => setHome({ hasPurifier: e.target.checked })}
          />
          We own an air purifier
        </label>
      </fieldset>

      <fieldset>
        <Legend>Budget for changes</Legend>
        <div className="grid grid-cols-3 overflow-hidden rounded-md border border-rule">
          {BUDGETS.map((budget) => (
            <label
              key={budget}
              className={`flex min-h-11 cursor-pointer items-center justify-center border-rule text-sm not-last:border-r has-focus-visible:outline-2 has-focus-visible:outline-accent ${
                profile.budget === budget ? "bg-ink text-paper" : "hover:bg-accent-soft"
              }`}
            >
              <input
                type="radio"
                name="budget"
                className="sr-only"
                value={budget}
                checked={profile.budget === budget}
                onChange={() => set("budget", budget)}
              />
              {BUDGET_LABELS[budget]}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor={notesId} className="mb-1 block text-sm">
          Anything else? <span className="text-ink-muted">(optional)</span>
        </label>
        <textarea
          id={notesId}
          aria-describedby={notesHintId}
          className="field min-h-20 resize-y"
          maxLength={280}
          value={profile.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="e.g. My son has football practice at 5pm"
        />
        <p id={notesHintId} className="mt-1 text-right font-mono text-xs text-ink-muted">
          {profile.notes.length}/280
        </p>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-ink px-5 font-medium text-paper transition-[background-color,transform] hover:bg-accent active:scale-[0.98] disabled:cursor-progress disabled:opacity-70"
      >
        {busy ? (
          <>
            <CircleNotch className="animate-spin" weight="bold" aria-hidden /> Reading today&apos;s air…
          </>
        ) : (
          <>
            Build today&apos;s plan <ArrowRight weight="bold" aria-hidden />
          </>
        )}
      </button>
    </form>
  );
}
