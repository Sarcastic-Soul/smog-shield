"use client";

import {
  COMMUTE_LABELS,
  COMMUTE_MODES,
  COOKING_FUELS,
  COOKING_LABELS,
  HEATING_LABELS,
  HEATING_TYPES,
  PROFILE_LIMITS,
  type Profile,
} from "@/lib/domain/profile-options";
import { CheckboxField, Legend, NumberField, SelectField } from "./fields";

interface CommuteProps {
  commute: Profile["commute"];
  onChange: (patch: Partial<Profile["commute"]>) => void;
}

export function CommuteFields({ commute, onChange }: CommuteProps) {
  return (
    <fieldset className="space-y-3">
      <Legend>Daily commute</Legend>
      <SelectField
        label="Main way to work or school"
        value={commute.mode}
        options={COMMUTE_MODES}
        labels={COMMUTE_LABELS}
        onChange={(mode) => onChange({ mode })}
      />
      {commute.mode !== "work_from_home" && (
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="One way"
            suffix="km"
            value={commute.distanceKm}
            min={0}
            max={PROFILE_LIMITS.distanceKmMax}
            step={0.5}
            onChange={(distanceKm) => onChange({ distanceKm })}
          />
          <NumberField
            label="Days a week"
            value={commute.daysPerWeek}
            min={0}
            max={PROFILE_LIMITS.daysPerWeekMax}
            onChange={(daysPerWeek) => onChange({ daysPerWeek })}
          />
        </div>
      )}
    </fieldset>
  );
}

interface HomeProps {
  home: Profile["home"];
  onChange: (patch: Partial<Profile["home"]>) => void;
}

export function HomeFields({ home, onChange }: HomeProps) {
  return (
    <fieldset className="space-y-3">
      <Legend>Home</Legend>
      <SelectField
        label="Cooking fuel"
        value={home.cooking}
        options={COOKING_FUELS}
        labels={COOKING_LABELS}
        onChange={(cooking) => onChange({ cooking })}
      />
      <SelectField
        label="Winter heating"
        value={home.heating}
        options={HEATING_TYPES}
        labels={HEATING_LABELS}
        onChange={(heating) => onChange({ heating })}
      />
      <NumberField
        label="Outdoor walk or exercise"
        suffix="min a day"
        value={home.outdoorExerciseMinutes}
        min={0}
        max={PROFILE_LIMITS.exerciseMinutesMax}
        step={5}
        onChange={(outdoorExerciseMinutes) => onChange({ outdoorExerciseMinutes })}
      />
      <div>
        <CheckboxField
          label="We own an air purifier"
          checked={home.hasPurifier}
          onChange={(hasPurifier) => onChange({ hasPurifier })}
        />
        <CheckboxField
          label="Someone smokes indoors"
          checked={home.smokerAtHome}
          onChange={(smokerAtHome) => onChange({ smokerAtHome })}
        />
        <CheckboxField
          label="Waste or crop burning near us"
          checked={home.wasteBurningNearby}
          onChange={(wasteBurningNearby) => onChange({ wasteBurningNearby })}
        />
      </div>
    </fieldset>
  );
}
