"use client";

import { ArrowRight, CircleNotch } from "@phosphor-icons/react";
import { useId, type FormEvent } from "react";
import { BUDGETS, LANGUAGE_NATIVE_NAMES, LANGUAGES, PROFILE_LIMITS, type Profile } from "@/lib/domain/profile-options";
import { Legend, SelectField } from "@/components/form/fields";
import { HouseholdFields } from "@/components/form/HouseholdFields";
import { CommuteFields, HomeFields } from "@/components/form/LifestyleFields";

interface Props {
  profile: Profile;
  onChange: (profile: Profile) => void;
  onSubmit: () => void;
  busy: boolean;
}

const BUDGET_LABELS = { low: "Tight", medium: "Some room", high: "Comfortable" } as const;
const NOTES_MAX = PROFILE_LIMITS.notesMax;

export function ProfileForm({ profile, onChange, onSubmit, busy }: Props) {
  const cityId = useId();
  const cityHintId = useId();
  const notesId = useId();
  const notesHintId = useId();

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => onChange({ ...profile, [key]: value });

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
          minLength={PROFILE_LIMITS.cityMin}
          maxLength={PROFILE_LIMITS.cityMax}
          placeholder="e.g. Lahore, Delhi, Lucknow"
          aria-describedby={cityHintId}
        />
        <p id={cityHintId} className="mt-1 text-xs text-ink-muted">
          Use English letters. Works for any city worldwide.
        </p>
      </div>

      <HouseholdFields
        household={profile.household}
        onChange={(patch) => set("household", { ...profile.household, ...patch })}
      />
      <CommuteFields commute={profile.commute} onChange={(patch) => set("commute", { ...profile.commute, ...patch })} />
      <HomeFields home={profile.home} onChange={(patch) => set("home", { ...profile.home, ...patch })} />

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

      <SelectField
        label="Plan language"
        value={profile.language}
        options={LANGUAGES}
        labels={LANGUAGE_NATIVE_NAMES}
        onChange={(language) => set("language", language)}
      />

      <div>
        <label htmlFor={notesId} className="mb-1 block text-sm">
          Anything else? <span className="text-ink-muted">(optional)</span>
        </label>
        <textarea
          id={notesId}
          aria-describedby={notesHintId}
          className="field min-h-20 resize-y"
          maxLength={NOTES_MAX}
          value={profile.notes}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="e.g. My son has football practice at 5pm"
        />
        <p id={notesHintId} className="mt-1 text-right font-mono text-xs text-ink-muted">
          {profile.notes.length}/{NOTES_MAX}
        </p>
      </div>

      <button
        type="submit"
        disabled={busy}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-md bg-ink px-5 font-medium text-paper transition-[background-color,transform] hover:bg-accent active:scale-[0.98] disabled:cursor-progress disabled:opacity-70"
      >
        {busy ? (
          <>
            <CircleNotch className="animate-spin motion-reduce:animate-none" weight="bold" aria-hidden /> Reading
            today&apos;s air…
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
