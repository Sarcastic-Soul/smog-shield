"use client";

import { useEffect, useRef, useState } from "react";
import { requestPlan } from "@/lib/client/api";
import { loadSavedProfile, saveProfile, validateProfile } from "@/lib/client/profile-storage";
import { isAbortError, messageOf } from "@/lib/client/errors";
import { DEFAULT_PROFILE, type Profile } from "@/lib/domain/profile-options";
import type { PlanResult } from "@/lib/domain/result";
import { AirReportPanel } from "./AirReportPanel";
import { AskPanel } from "./AskPanel";
import { ForecastStrip } from "./ForecastStrip";
import { ImpactSimulator } from "./ImpactSimulator";
import { PlanView } from "./PlanView";
import { EmptyState, ErrorState, LoadingState } from "./ResultStates";
import { ProfileForm } from "./ProfileForm";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  /** `pending` is true while a rule-based draft is shown and Gemini is still writing. */
  | { status: "ready"; result: PlanResult; profile: Profile; pending: boolean };

function statusLine(state: State): string {
  switch (state.status) {
    case "idle":
      return "";
    case "loading":
      return "Reading today's air…";
    case "error":
      return `Could not build the plan: ${state.message}`;
    case "ready": {
      const { report, insights } = state.result;
      const base = `Plan ready for ${report.place.name}: AQI ${report.now.aqi}, ${insights.risk.level} risk.`;
      return state.pending ? `${base} Gemini is tailoring it.` : base;
    }
  }
}

export function SmogShieldApp() {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [state, setState] = useState<State>({ status: "idle" });
  const resultsRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let active = true;
    // Restoring after mount avoids a hydration mismatch.
    void loadSavedProfile().then((saved) => {
      if (active && saved) setProfile(saved);
    });
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, []);

  function showResults() {
    requestAnimationFrame(() => {
      resultsRef.current?.focus({ preventScroll: true });
      resultsRef.current?.scrollIntoView({ block: "start" });
    });
  }

  async function submit() {
    // A ref (not state) so a fast double click cannot start two requests.
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const checked = await validateProfile(profile);
      if (!checked.ok) {
        setState({ status: "error", message: checked.message });
        return;
      }
      saveProfile(checked.profile);
      await streamPlan(checked.profile);
    } catch (err) {
      if (!isAbortError(err)) setState({ status: "error", message: messageOf(err) });
    } finally {
      inFlight.current = false;
    }
  }

  /** Shows the draft as soon as it arrives, then swaps in the final plan. */
  async function streamPlan(checked: Profile) {
    controller.current = new AbortController();
    setState({ status: "loading" });
    let shown = false;
    await requestPlan(
      checked,
      (event) => {
        setState({ status: "ready", result: event.result, profile: checked, pending: event.kind === "draft" });
        if (!shown) showResults();
        shown = true;
      },
      controller.current.signal,
    );
  }

  return (
    <div className="mx-auto grid max-w-[1400px] gap-10 px-4 pb-24 sm:px-8 lg:grid-cols-[360px_1fr] lg:gap-16">
      <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto lg:pr-2">
        <ProfileForm profile={profile} onChange={setProfile} onSubmit={submit} busy={state.status === "loading"} />
      </aside>

      <div id="results" ref={resultsRef} tabIndex={-1} className="min-w-0 scroll-mt-4 focus:outline-none">
        {/* One short live message instead of reading the whole plan aloud. */}
        <p role="status" className="sr-only">
          {statusLine(state)}
        </p>
        {state.status === "idle" && <EmptyState />}
        {state.status === "loading" && <LoadingState city={profile.city} />}
        {state.status === "error" && <ErrorState message={state.message} />}
        {state.status === "ready" && (
          <Results
            key={state.result.report.now.time + state.result.report.place.name}
            result={state.result}
            profile={state.profile}
            pending={state.pending}
          />
        )}
      </div>
    </div>
  );
}

interface ResultsProps {
  result: PlanResult;
  profile: Profile;
  pending: boolean;
}

/** Every results panel, in reading order. */
function Results({ result, profile, pending }: ResultsProps) {
  const { report, insights, plan, source } = result;
  return (
    <div className="animate-rise">
      <AirReportPanel report={report} insights={insights} />
      <ForecastStrip
        hours={report.next24h}
        windows={insights.windows}
        outlook={insights.outlook}
        nowTime={report.now.time}
      />
      <PlanView
        plan={plan}
        source={source}
        pending={pending}
        safetyAlerts={insights.safetyAlerts}
        language={profile.language}
      />
      <ImpactSimulator profile={profile} insights={insights} />
      <AskPanel profile={profile} />
    </div>
  );
}
