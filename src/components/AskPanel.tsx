"use client";

import { PaperPlaneRight } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { askQuestion } from "@/lib/client/api";
import { isAbortError, messageOf } from "@/lib/client/errors";
import { QUESTION_LIMITS, RTL_LANGUAGES, type Profile } from "@/lib/domain/profile-options";

const SUGGESTIONS = [
  "Is it safe for my kids to play outside after school?",
  "Which room should get the purifier?",
  "Is a cloth mask enough for my commute?",
];

export function AskPanel({ profile }: { profile: Profile }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [asked, setAsked] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const inputId = useId();

  useEffect(() => () => controller.current?.abort(), []);

  async function ask(text: string) {
    const trimmed = text.trim();
    if (trimmed.length < QUESTION_LIMITS.min || busy) return;
    controller.current?.abort();
    controller.current = new AbortController();
    setBusy(true);
    setError(null);
    setAnswer("");
    setAsked(trimmed);
    try {
      await askQuestion(profile, trimmed, setAnswer, controller.current.signal);
      setQuestion("");
    } catch (err) {
      if (!isAbortError(err)) setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask(question);
  };

  return (
    <section aria-labelledby="ask-title" className="py-10">
      <h2 id="ask-title" className="font-serif text-3xl tracking-tight">
        Ask about your day
      </h2>
      <p className="mt-2 text-ink-muted">Answers use today&apos;s readings for {profile.city} and your household.</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => {
              setQuestion(s);
              void ask(s);
            }}
            className="min-h-11 rounded-md border border-rule px-3 text-left text-sm transition-colors hover:border-ink-muted hover:bg-accent-soft disabled:opacity-60"
          >
            {s}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="mt-4 flex gap-2">
        <label htmlFor={inputId} className="sr-only">
          Your question
        </label>
        <input
          id={inputId}
          className="field"
          value={question}
          maxLength={QUESTION_LIMITS.max}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="e.g. Should I send my father for his morning walk?"
        />
        <button
          type="submit"
          disabled={busy || question.trim().length < QUESTION_LIMITS.min}
          className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-md bg-ink px-4 text-paper transition-colors hover:bg-accent disabled:opacity-50"
        >
          <PaperPlaneRight weight="bold" aria-hidden />
          <span className="sr-only sm:not-sr-only">Ask</span>
        </button>
      </form>

      <div aria-live="polite" aria-busy={busy} className="mt-6 max-w-2xl">
        {asked && <p className="text-sm text-ink-muted">You asked: {asked}</p>}
        {answer && (
          <p
            lang={profile.language}
            dir={RTL_LANGUAGES.has(profile.language) ? "rtl" : "ltr"}
            className="mt-2 whitespace-pre-line text-lg"
          >
            {answer}
          </p>
        )}
        {busy && !answer && <p className="mt-2 text-ink-muted">Thinking…</p>}
        {error && (
          <p role="alert" className="mt-2 text-alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
