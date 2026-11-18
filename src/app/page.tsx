import { connection } from "next/server";
import { SmogShieldApp } from "@/components/SmogShieldApp";

export default async function Home() {
  // Render per request so each page gets its own CSP nonce (see src/proxy.ts).
  await connection();
  return (
    <>
      <header className="mx-auto max-w-[1400px] px-4 pt-6 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-ink pb-3">
          <p className="font-serif text-3xl font-semibold tracking-tight">Smog Shield</p>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-ink-muted">
            Daily air plan for families · live data, explained
          </p>
        </div>
      </header>
      <main id="main" className="pt-8">
        <h1 className="sr-only">Smog Shield: a daily air quality plan for your household</h1>
        <SmogShieldApp />
      </main>
      <footer className="mx-auto max-w-[1400px] border-t border-rule px-4 py-6 text-sm text-ink-muted sm:px-8">
        Air data: Open-Meteo (CAMS). Advice is general public-health guidance, not medical advice. See a doctor for
        symptoms.
      </footer>
    </>
  );
}
