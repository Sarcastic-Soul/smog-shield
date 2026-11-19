/* What the results column shows before a plan exists. */

const STEPS = [
  [
    "Live readings",
    "We pull the current AQI, a 24-hour PM2.5 forecast and a 3-day outlook for your city from Open-Meteo.",
  ],
  [
    "Your household",
    "Children, older relatives, asthma or heart conditions change what is safe. So do your commute, stove and heating.",
  ],
  [
    "A plan with numbers",
    "Gemini turns the readings into your next 24 hours, indoor fixes, greener swaps and things to do with neighbours, each with its measured effect.",
  ],
] as const;

export function EmptyState() {
  return (
    <div className="max-w-2xl pt-2">
      <p className="font-serif text-5xl leading-[1.05] tracking-tight md:text-6xl">
        Winter smog changes by the hour. Your day can change with it.
      </p>
      <ol className="mt-10 divide-y divide-rule border-y border-rule">
        {STEPS.map(([title, body], i) => (
          <li key={title} className="grid grid-cols-[3rem_1fr] gap-2 py-5">
            <span className="font-mono text-sm text-ink-muted">0{i + 1}</span>
            <div>
              <p className="font-medium">{title}</p>
              <p className="text-ink-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-6 text-sm text-ink-muted">
        Fill in your home and press <span className="text-ink">Build today&apos;s plan</span>.
      </p>
    </div>
  );
}

export function LoadingState({ city }: { city: string }) {
  return (
    <div className="space-y-4 pt-2">
      <p className="font-serif text-3xl tracking-tight">Reading the air over {city}…</p>
      <div className="h-36 w-64 animate-pulse rounded-md bg-rule motion-reduce:animate-none" />
      <div className="h-40 animate-pulse rounded-md bg-rule motion-reduce:animate-none" />
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-md border border-alert bg-alert-soft p-6">
      <p className="font-medium text-alert">We could not build your plan</p>
      <p className="mt-1">{message}</p>
    </div>
  );
}
