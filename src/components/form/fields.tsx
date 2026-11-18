"use client";

import { useId, type ReactNode } from "react";

export function Legend({ children }: { children: ReactNode }) {
  return <legend className="mb-3 font-mono text-xs uppercase tracking-[0.12em] text-ink-muted">{children}</legend>;
}

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}

export function NumberField({ label, value, min, max, step = 1, suffix, onChange }: NumberFieldProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm">
        {label}
        {suffix ? <span className="text-ink-muted"> ({suffix})</span> : null}
      </label>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        className="field tabular-nums"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
      />
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  label: string;
  value: T;
  options: readonly T[];
  labels: Record<T, string>;
  onChange: (value: T) => void;
}

export function SelectField<T extends string>({ label, value, options, labels, onChange }: SelectFieldProps<T>) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm">
        {label}
      </label>
      <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
    </div>
  );
}

interface CheckboxFieldProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Text style; defaults to small body text. */
  textClassName?: string;
}

export function CheckboxField({ label, checked, onChange, textClassName = "text-sm" }: CheckboxFieldProps) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-center gap-3 ${textClassName}`}>
      <input
        type="checkbox"
        className="size-4 accent-[var(--accent)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}
