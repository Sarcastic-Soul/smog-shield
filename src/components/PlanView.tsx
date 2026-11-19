import { CircleNotch, UsersThree, Warning } from "@phosphor-icons/react";
import type { Plan, PlanSource } from "@/lib/domain/plan";
import { textDirection, type Language } from "@/lib/domain/profile-options";

interface Props {
  plan: Plan;
  source: PlanSource;
  /** True while this is a rule-based draft and Gemini is still writing. */
  pending: boolean;
  safetyAlerts: string[];
  language: Language;
}

function SectionTitle({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="mb-5 font-serif text-2xl tracking-tight">
      {children}
    </h3>
  );
}

function sourceLabel(source: PlanSource, pending: boolean): string {
  if (source === "gemini") return "Written by Gemini from today's numbers";
  return pending ? "Quick plan from today's numbers" : "Built from rules (AI busy right now)";
}

export function PlanView({ plan, source, pending, safetyAlerts, language }: Props) {
  // Gemini writes in the chosen language; the rule-based plan is English only.
  const textLanguage: Language = source === "gemini" ? language : "en";
  const textProps = textDirection(textLanguage);
  const englishFallback = source === "rules" && language !== "en" && !pending;

  return (
    <section aria-labelledby="plan-title" className="border-b border-rule py-10">
      <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-muted">{sourceLabel(source, pending)}</p>
      {pending && (
        <p className="mt-2 inline-flex items-center gap-2 rounded-md bg-accent-soft px-3 py-1.5 text-sm text-accent">
          <CircleNotch weight="bold" aria-hidden className="animate-spin motion-reduce:animate-none" />
          Gemini is tailoring this plan to your household. It will update here.
        </p>
      )}
      {englishFallback && (
        <p className="mt-2 text-sm text-ink-muted">
          Gemini is busy, so this plan is in English. Try again in a minute for your chosen language.
        </p>
      )}
      <h2
        id="plan-title"
        {...textProps}
        className="mt-2 max-w-3xl font-serif text-4xl leading-[1.1] tracking-tight md:text-5xl"
      >
        {plan.headline}
      </h2>
      <p {...textProps} className="mt-4 max-w-2xl text-lg">
        {plan.summary}
      </p>

      {safetyAlerts.length > 0 && (
        <div role="alert" className="mt-6 max-w-2xl space-y-2 rounded-md border border-alert bg-alert-soft p-4">
          {safetyAlerts.map((alert) => (
            <p key={alert} className="flex gap-3">
              <Warning weight="bold" className="mt-1 shrink-0 text-alert" aria-hidden />
              <span>{alert}</span>
            </p>
          ))}
        </div>
      )}

      <div className="mt-10 grid gap-12 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <SectionTitle id="routine-title">Your next 24 hours</SectionTitle>
          <ol aria-labelledby="routine-title" className="relative border-l border-rule" {...textProps}>
            {plan.routine.map((step) => (
              <li key={`${step.day}-${step.time}-${step.activity}`} className="mb-6 pl-6 last:mb-0">
                <span
                  aria-hidden
                  className="absolute -left-[5px] mt-2 size-[9px] rounded-full border border-ink bg-paper"
                />
                <p className="font-mono text-sm text-ink-muted">
                  <time>{step.time}</time>
                  {step.day === "tomorrow" && (
                    <span lang="en" className="ml-2 rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs text-accent">
                      tomorrow
                    </span>
                  )}
                </p>
                <p className="font-medium">{step.activity}</p>
                <p className="text-sm text-ink-muted">{step.why}</p>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-12">
          <div>
            <SectionTitle id="indoor-title">Cleaner air indoors</SectionTitle>
            <ul aria-labelledby="indoor-title" className="divide-y divide-rule border-y border-rule" {...textProps}>
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
            <div>
              <SectionTitle id="groups-title">For the people most at risk</SectionTitle>
              <dl aria-labelledby="groups-title" className="space-y-4" {...textProps}>
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

      <div className="mt-12">
        <SectionTitle id="swaps-title">Swaps that cut emissions</SectionTitle>
        <ul
          aria-labelledby="swaps-title"
          className="grid gap-px overflow-hidden rounded-md border border-rule bg-rule md:grid-cols-2"
          {...textProps}
        >
          {plan.alternatives.map((alt) => (
            <li key={alt.swap} className="bg-paper-raised p-5 md:odd:last:col-span-2">
              <p className="font-medium">{alt.swap}</p>
              <p className="text-sm">{alt.action}</p>
              <p className="mt-2 text-sm text-accent">{alt.impact}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-12">
        <SectionTitle id="community-title">
          <span className="inline-flex items-center gap-3">
            <UsersThree weight="bold" aria-hidden className="text-accent" />
            With your neighbours
          </span>
        </SectionTitle>
        <ul
          aria-labelledby="community-title"
          className="max-w-3xl divide-y divide-rule border-y border-rule"
          {...textProps}
        >
          {plan.communityActions.map((item) => (
            <li key={`${item.who}-${item.action}`} className="grid gap-1 py-4 sm:grid-cols-[12rem_1fr] sm:gap-6">
              <p className="font-medium">{item.who}</p>
              <div>
                <p className="text-sm">{item.action}</p>
                <p className="mt-1 text-sm text-accent">{item.impact}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
