"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { requestPlan } from "@/lib/client/api";
import { DEFAULT_PROFILE, profileSchema, type Profile } from "@/lib/domain/profile";
import type { PlanResult } from "@/lib/server/plan-service";
import { AirReportPanel } from "./AirReportPanel";
import { AskPanel } from "./AskPanel";
import { ForecastStrip } from "./ForecastStrip";
import { ImpactSimulator } from "./ImpactSimulator";
import { PlanView } from "./PlanView";
import { ProfileForm } from "./ProfileForm";

const STORAGE_KEY = "smog-shield:profile";

function loadSavedProfile(): Profile | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = profileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function saveProfile(profile: Profile): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Storage can be blocked (private mode); the app works without it.
  }
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: PlanResult; profile: Profile };

export function SmogShieldApp() {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [state, setState] = useState<State>({ status: "idle" });
  const resultsRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const saved = loadSavedProfile();
    // Restoring a saved profile after mount avoids a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved) setProfile(saved);
    return () => controller.current?.abort();
  }, []);

  async function submit() {
    const parsed = profileSchema.safeParse(profile);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setState({ status: "error", message: `${issue.path.join(" ")}: ${issue.message}` });
      return;
    }
    controller.current?.abort();
    controller.current = new AbortController();
    setState({ status: "loading" });
    saveProfile(parsed.data);
    try {
      const result = await requestPlan(parsed.data, controller.current.signal);
      setState({ status: "ready", result, profile: parsed.data });
      requestAnimationFrame(() => resultsRef.current?.focus());
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setState({ status: "error", message: (err as Error).message });
    }
  }

  return (
    <div className="mx-auto grid max-w-[1400px] gap-10 px-4 pb-24 sm:px-8 lg:grid-cols-[360px_1fr] lg:gap-16">
      <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-2">
        <ProfileForm profile={profile} onChange={setProfile} onSubmit={submit} busy={state.status === "loading"} />
      </aside>

      <div
        id="results"
        ref={resultsRef}
        tabIndex={-1}
        aria-live="polite"
        aria-busy={state.status === "loading"}
        className="min-w-0 focus:outline-none"
      >
        {state.status === "idle" && <EmptyState />}
        {state.status === "loading" && <LoadingState city={profile.city} />}
        {state.status === "error" && (
          <div role="alert" className="rounded-md border border-alert bg-alert-soft p-6">
            <p className="font-medium text-alert">We could not build your plan.</p>
            <p className="mt-1">{state.message}</p>
          </div>
        )}
        {state.status === "ready" && (
          <motion.div
            key={state.result.report.now.time + state.result.report.place.name}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", bounce: 0, duration: 0.5 }}
          >
            <AirReportPanel report={state.result.report} insights={state.result.insights} />
            <ForecastStrip hours={state.result.report.next24h} windows={state.result.insights.windows} />
            <PlanView
              plan={state.result.plan}
              source={state.result.source}
              safetyAlerts={state.result.insights.safetyAlerts}
            />
            <ImpactSimulator profile={state.profile} insights={state.result.insights} />
            <AskPanel profile={state.profile} />
          </motion.div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="max-w-2xl pt-2">
      <p className="font-serif text-5xl leading-[1.05] tracking-tight md:text-6xl">
        Winter smog changes by the hour. Your day can change with it.
      </p>
      <ol className="mt-10 divide-y divide-rule border-y border-rule">
        {[
          ["Live readings", "We pull the current AQI and a 24-hour PM2.5 forecast for your city from Open-Meteo."],
          ["Your household", "Children, older relatives, asthma or heart conditions change what is safe. So do your commute and stove."],
          ["A plan with numbers", "Gemini turns the readings into today's routine, indoor fixes and greener swaps, each with its measured effect."],
        ].map(([title, body], i) => (
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
        Fill in your home on the left and press <span className="text-ink">Build today&apos;s plan</span>.
      </p>
    </div>
  );
}

function LoadingState({ city }: { city: string }) {
  return (
    <div className="space-y-4 pt-2" role="status">
      <p className="font-serif text-3xl tracking-tight">Reading the air over {city}…</p>
      <div className="h-36 w-64 animate-pulse rounded-md bg-rule motion-reduce:animate-none" />
      <div className="h-40 animate-pulse rounded-md bg-rule motion-reduce:animate-none" />
    </div>
  );
}
