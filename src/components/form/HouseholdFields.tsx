"use client";

import {
  CONDITION_LABELS,
  HEALTH_CONDITIONS,
  PROFILE_LIMITS,
  type HealthCondition,
  type Profile,
} from "@/lib/domain/profile-options";
import { CHOICE_INPUT_CLASS, Legend, NumberField } from "./fields";

interface Props {
  household: Profile["household"];
  onChange: (patch: Partial<Profile["household"]>) => void;
}

export function HouseholdFields({ household, onChange }: Props) {
  const toggle = (condition: HealthCondition, on: boolean) =>
    onChange({
      conditions: on ? [...household.conditions, condition] : household.conditions.filter((c) => c !== condition),
    });

  return (
    <fieldset>
      <Legend>Who lives at home</Legend>
      <div className="grid grid-cols-3 gap-3">
        <NumberField
          label="Adults"
          value={household.adults}
          min={1}
          max={PROFILE_LIMITS.peopleMax}
          onChange={(adults) => onChange({ adults })}
        />
        <NumberField
          label="Children"
          value={household.children}
          min={0}
          max={PROFILE_LIMITS.peopleMax}
          onChange={(children) => onChange({ children })}
        />
        <NumberField
          label="Over 65"
          value={household.seniors}
          min={0}
          max={PROFILE_LIMITS.peopleMax}
          onChange={(seniors) => onChange({ seniors })}
        />
      </div>
      <p className="mb-2 mt-4 text-sm" id="conditions-label">
        Health conditions at home
      </p>
      <div className="flex flex-wrap gap-2" role="group" aria-labelledby="conditions-label">
        {HEALTH_CONDITIONS.map((condition) => {
          const checked = household.conditions.includes(condition);
          return (
            <label
              key={condition}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors ${
                checked ? "border-accent bg-accent-soft" : "border-rule hover:border-ink-muted"
              }`}
            >
              <input
                type="checkbox"
                className={CHOICE_INPUT_CLASS}
                checked={checked}
                onChange={(e) => toggle(condition, e.target.checked)}
              />
              {CONDITION_LABELS[condition]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
