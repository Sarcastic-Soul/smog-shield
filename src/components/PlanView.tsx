import { Warning } from "@phosphor-icons/react";
import type { Plan, PlanSource } from "@/lib/domain/plan";

interface Props {
  plan: Plan;
  source: PlanSource;
  safetyAlerts: string[];
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="mb-5 font-serif text-2xl tracking-tight">
      {children}
    </h3>
  );
}

export function PlanView({ plan, source, safetyAlerts }: Props) {
  return (
    <section aria-labelledby="plan-title" className="border-b border-rule py-10">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-muted">
        {source === "gemini" ? "Written by Gemini from today's numbers" : "Built from rules (AI offline)"}
      </p>
      <h2 id="plan-title" className="mt-2 max-w-3xl font-serif text-4xl leading-[1.1] tracking-tight md:text-5xl">
        {plan.headline}
      </h2>
      <p className="mt-4 max-w-2xl text-lg">{plan.summary}</p>

      {safetyAlerts.length > 0 && (
        <div role="alert" className="mt-6 max-w-2xl rounded-md border border-alert bg-alert-soft p-4 text-alert">
          {safetyAlerts.map((alert) => (
            <p key={alert} className="flex gap-3">
              <Warning weight="bold" className="mt-1 shrink-0" aria-hidden />
              <span className="text-ink">{alert}</span>
            </p>
          ))}
        </div>
      )}

      <div className="mt-10 grid gap-12 lg:grid-cols-[1.2fr_1fr]">
        <div aria-labelledby="routine-title">
          <SectionTitle id="routine-title">Today&apos;s routine</SectionTitle>
          <ol className="relative border-l border-rule">
            {plan.routine.map((step) => (
              <li key={`${step.time}-${step.activity}`} className="mb-6 pl-6 last:mb-0">
                <span aria-hidden className="absolute -left-[5px] mt-2 size-[9px] rounded-full border border-ink bg-paper" />
                <time className="font-mono text-sm text-ink-muted">{step.time}</time>
                <p className="font-medium">{step.activity}</p>
                <p className="text-sm text-ink-muted">{step.why}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-12">
          <div aria-labelledby="indoor-title">
            <SectionTitle id="indoor-title">Cleaner air indoors</SectionTitle>
            <ul className="divide-y divide-rule border-y border-rule">
              {plan.indoorHacks.map((hack) => (
                <li key={hack.title} className="py-4">
                  <p className="font-medium">{hack.title}</p>
                  <p className="text-sm">{hack.action}</p>
                  <p className="mt-1 text-sm text-accent">{hack.impact}</p>
                </li>
              ))}
            </ul>
          </div>

          {plan.groupAdvice.length > 0 && (
            <div aria-labelledby="groups-title">
              <SectionTitle id="groups-title">For the people most at risk</SectionTitle>
              <dl className="space-y-4">
                {plan.groupAdvice.map((item) => (
                  <div key={item.group}>
                    <dt className="font-medium first-letter:uppercase">{item.group}</dt>
                    <dd className="text-sm">{item.advice}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
      </div>

      <div aria-labelledby="swaps-title" className="mt-12">
        <SectionTitle id="swaps-title">Swaps that cut emissions</SectionTitle>
        <ul className="grid gap-px overflow-hidden rounded-md border border-rule bg-rule md:grid-cols-2">
          {plan.alternatives.map((alt) => (
            <li key={alt.swap} className="bg-paper-raised p-5">
              <p className="font-medium">{alt.swap}</p>
              <p className="text-sm">{alt.action}</p>
              <p className="mt-2 text-sm text-accent">{alt.impact}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
