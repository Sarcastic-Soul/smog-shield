# Smog Shield

**Live:** https://smog-shield.vercel.app

A GenAI assistant that helps families and their neighbours get through winter smog. It reads live air quality for your city, looks at who lives in your home and how you live, and plans your next 24 hours: a low-exposure routine, indoor air fixes, greener swaps and things to do with your building, school or workplace. Every suggestion carries its measured effect, such as "moving your 45-minute walk to 14:00 means you breathe 60% less PM2.5" or "if 40 homes in your building take the metro, that is 26 t of CO₂ a year saved".

**Chosen vertical:** Challenge 6, Urban Air Quality Assistant.

## What it does

1. **Live readings.** The server geocodes the city and pulls the current US AQI and the pollutant driving it (PM2.5, PM10, NO₂, ozone, CO, SO₂), a 24-hour hourly forecast and a 3-day outlook from [Open-Meteo](https://open-meteo.com/en/docs/air-quality-api) (CAMS data, no key needed).
2. **Household context.** The family enters adults, children, people over 65, health conditions (asthma, COPD, heart disease, pregnancy, allergies), commute mode and distance, cooking fuel, heating, purifier, indoor smoking, waste burning nearby, daily outdoor minutes, budget, language and a free-text note ("my son has cricket at 5pm").
3. **Rule engine (deterministic, tested).** `src/lib/domain/` turns readings and profile into facts:
   - household risk (sensitive members push risk up one band, as the EPA scale does), and whether an N95 is advised,
   - cleanest and worst 2-hour daytime windows, ranked by hourly PM2.5, labelled today or tomorrow,
   - inhaled-dose maths for moving or moving indoors your exercise (`concentration × breathing rate × time`),
   - indoor PM2.5 with windows shut, with a HEPA purifier, and with indoor smoking,
   - commute swaps with weekly and yearly CO₂ and tailpipe PM2.5 saved, scaled to 40 or 1,000 homes,
   - 3-day trend (worsening, steady, improving),
   - safety alerts: carbon monoxide from coal or wood fires, NO₂ from unflued gas heaters, smoking near sensitive people.
4. **Gemini writes the plan.** The facts go to Gemini (`gemini-3.5-flash-lite`, with `gemini-3.1-flash-lite` and `gemini-3-flash-preview` as overload backups) with structured JSON output against a zod schema. The system prompt makes it quote only the given numbers, start from the local time now, fit the family's own plans into cleaner hours, name each at-risk group, suit the budget and write in the chosen language (English, Hindi, Urdu, Bengali or Punjabi).
5. **Instant draft, then Gemini.** The plan streams as NDJSON: a rule-based draft appears in about a second, and Gemini's tailored plan replaces it when ready (10 to 20 s at peak), so nobody stares at a spinner.
6. **Rules check the AI.** English Gemini plans are topped up from the rule engine if they come back thin (fewer than 3 indoor fixes or 2 community actions, or a top commute swap missing). If Gemini is down, slow or returns invalid output, the full rule-based plan is used, and the page says so.
7. **Try a change, see the effect.** A client-side simulator lets the family switch commute modes, scale the change to their building or ward, toggle a purifier, and move or bring indoors their exercise, with numbers updating instantly and no extra requests.
8. **Ask follow-up questions.** A streamed Q&A box answers questions like "Is it safe for my kids to play outside after school?" using the same server-built facts.

## How it works

```
Browser ──POST /api/plan {profile}──▶ Route handler
                                       ├─ same-site check, 8 KB body limit, strict zod schema, per-IP rate limit
                                       ├─ getAirReport(city)  geocode cache 24 h, air cache 10 min by coords ──▶ Open-Meteo
                                       ├─ buildInsights(profile, report)                  (pure functions)
                                       ├─ NDJSON line 1: rule-based draft (instant)
                                       ├─ generatePlan(facts)  JSON schema, model chain   ──▶ Gemini
                                       │     ├─ reconcilePlan(): fill gaps from rules
                                       │     └─ on failure: keep rules plan  (circuit breaker after 3 failures)
                                       ├─ NDJSON line 2: final plan
                                       └─ plan cache per (forecast hour, profile): AI 1 h, rules 60 s
        ◀── {kind:"draft"|"final", result:{ report, insights, plan, source }}

Browser ──POST /api/ask {profile, question}──▶ facts rebuilt on the server ──▶ Gemini stream ──▶ text/plain stream
```

| Folder           | What lives there                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| `src/lib/air`    | AQI bands and PM2.5→AQI, Open-Meteo client with response validation and retry                        |
| `src/lib/domain` | Profile schema, risk, windows, impact maths, insights, plan schema, fallback plan and reconciliation |
| `src/lib/ai`     | Prompt building (facts block, injection-safe user text) and the Gemini client                        |
| `src/lib/server` | Caches, plan service (dependency-injected), rate limiter, HTTP helpers, CSP                          |
| `src/lib/client` | Typed fetch helpers for the two API routes                                                           |
| `src/app/api`    | `plan` and `ask` route handlers                                                                      |
| `src/components` | Form, air report, forecast and outlook, plan, impact simulator, ask panel                            |
| `src/proxy.ts`   | Per-request CSP nonce                                                                                |
| `tests`          | Vitest unit and component tests, Playwright end-to-end and axe accessibility tests                   |

## Security

- The Gemini key lives only on the server (`server-only` guard). The browser talks only to this app.
- Page CSP uses a fresh nonce per request with `'strict-dynamic'`, so no injected inline script can run. API responses get `default-src 'none'`. Also HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer and permissions policies.
- Request bodies are capped by declared size and by a streaming byte counter that stops reading past 8 KB, then validated with strict zod schemas (unknown keys rejected, numbers bounded, city limited to letters).
- Cross-site browser calls to the API are refused, so other pages cannot spend the AI quota.
- User free text is NFKC-normalised, stripped of invisible control/format characters, `<` `>` and fake section labels, then wrapped in tags the system prompt marks as data. Model output is schema-validated before use. `/api/ask` rebuilds facts on the server, so a client cannot feed fake numbers to the model, and the assistant refuses off-topic requests.
- Per-IP rate limits (10 plans/min, 20 questions/min, keyed on Vercel's `x-real-ip`), upstream timeouts, generic error messages.

## Efficiency

- Geocoding is cached for a day (unknown cities too), air data for 10 minutes keyed by rounded coordinates, and concurrent requests for the same key share one upstream call.
- Gemini plans are cached per forecast hour and profile. After a failure, the rules plan is reused for a minute and a circuit breaker skips Gemini for 60 s after 3 failures in a row, so users never wait on a model that is down.
- Each model attempt has its own timeout inside an overall budget; follow-up answers stream so text shows at once.
- The first useful plan arrives in about a second (streamed rules draft); functions run in Mumbai (`bom1`) near the main users.
- The simulator uses domain helpers on numbers already sent. No animation library, and zod is lazy-loaded on the client so it is not in the first page load.
- Window search is a single O(n) sliding sum.

## Accessibility

- Semantic landmarks, skip link, one `h1`, labelled fields and fieldsets, 44 px touch targets, visible focus rings.
- Results and streamed answers are announced through `aria-live` regions; focus moves to the results; errors use `role="alert"`.
- The forecast chart has a screen-reader table with exact values. Colour is never the only signal.
- Plans and answers can be read in five languages, with `lang` and `dir="rtl"` set for Urdu.
- Respects `prefers-reduced-motion` and `prefers-color-scheme` (light and dark). Works at 390 px with no sideways scroll.
- Checked with axe in the Playwright suite.

## Testing

- **Unit and component tests (Vitest + Testing Library):** air client, AQI maths, risk, windows, impact, insights, plan schema, fallback and reconciliation, prompt building, Gemini client (model chain, breaker), caches, rate limiter, HTTP helpers, CSP, both route handlers, plan service, and every component.
- **End-to-end (Playwright):** full plan flow, simulator, ask panel, error states, saved profile, keyboard-only use, 390 px layout, CSP nonce header, and axe scans of the empty, results and error states. The API is mocked at the browser, so no key or network is needed.
- Coverage thresholds are enforced in `vitest.config.mts`.

## Running it

```bash
pnpm install
cp .env.example .env.local   # add GEMINI_API_KEY
pnpm dev                      # http://localhost:3000

pnpm test            # unit + component tests
pnpm test:coverage   # with coverage thresholds
pnpm test:e2e        # end-to-end + axe (no key needed)
pnpm lint && pnpm typecheck && pnpm build
```

| Variable         | Required                 | Notes                                            |
| ---------------- | ------------------------ | ------------------------------------------------ |
| `GEMINI_API_KEY` | No (falls back to rules) | Google AI Studio key                             |
| `GEMINI_MODEL`   | No                       | Tried first; defaults to `gemini-3.5-flash-lite` |

## Assumptions

- **AQI scale.** Open-Meteo returns the US EPA AQI, so the app uses it everywhere. India's NAQI uses different breakpoints; PM2.5 in µg/m³ is shown next to it so either reading makes sense. Hourly bars and windows use the EPA 2024 PM2.5 breakpoints on hourly PM2.5, because the official AQI is a 24-hour average and hides the hour-to-hour swings that matter for planning.
- **City names** must be in English letters; the Open-Meteo geocoder does not match Devanagari or Urdu script. The plan itself can be in five languages; page headings stay in English.
- **Emission and exposure factors** are published averages, used to show the size of a choice, not to audit anyone:
  - CO₂ per passenger-km: petrol car 0.14, diesel 0.15, CNG 0.11, two-wheeler 0.04, auto 0.06, bus 0.015, metro 0.02 kg (India GHG Program / ICCT ranges).
  - Indoor/outdoor PM2.5 ratio in closed winter homes: 0.7 (Delhi studies report 0.5 to 0.9). Indoor smoking adds about 40 µg/m³.
  - HEPA purifier sized for the room: about 60% less indoor PM2.5. Fitted N95 in real use: about 80% less inhaled PM2.5.
  - Breathing rate: 0.5 m³/h at rest, 1.6 m³/h exercising, light walking about twice resting (US EPA Exposure Factors Handbook).
  - 22 µg/m³ of PM2.5 for a day ≈ one cigarette (Berkeley Earth). WHO 24-hour PM2.5 guideline: 15 µg/m³.
  - Kitchen PM2.5 added while cooking: biomass ~500, kerosene ~150, LPG/PNG ~25, induction ~5 µg/m³ (WHO household air pollution ranges).
  - A mature tree takes up about 21 kg CO₂ a year.
- A commute is a return trip on each listed day; a year has 46 working weeks. Walking is offered only for trips up to 2.5 km and cycling up to 8 km. A "building" is 40 homes and a "ward" 1,000.
- Daytime planning hours are 06:00 to 21:00 local time.
- Rate limits and caches are in memory per server instance, which is enough for a demo; a shared store (e.g. Redis) would be used at scale.
- Advice is general public-health guidance, not medical advice.
