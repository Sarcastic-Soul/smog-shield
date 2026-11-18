# Smog Shield

A GenAI assistant that helps families get through winter smog. It reads live air quality for your city, looks at who lives in your home and how you live, and gives you today's plan: a low-exposure routine, indoor air fixes and greener swaps. Every suggestion comes with its measured effect, such as "moving your 45-minute walk to 15:00 means you breathe 52% less PM2.5" or "taking the metro saves 662 kg of CO₂ a year".

**Chosen vertical:** Challenge 6, Urban Air Quality Assistant.

## What it does

1. **Live readings.** The server geocodes the city and pulls the current US AQI, PM2.5, PM10, NO₂, ozone and CO, plus a 24-hour hourly forecast, from [Open-Meteo](https://open-meteo.com/en/docs/air-quality-api) (CAMS data, no key needed).
2. **Household context.** The family enters adults, children, people over 65, health conditions (asthma, COPD, heart disease, pregnancy, allergies), commute mode and distance, cooking fuel, heating, purifier, daily outdoor minutes, budget and a free-text note.
3. **Rule engine (deterministic, tested).** `src/lib/domain/` turns the readings and the profile into facts:
   - household risk level (sensitive members push risk up one band, as the EPA scale does),
   - cleanest and worst 2-hour daytime windows, ranked by hourly PM2.5,
   - inhaled-dose maths for moving exercise (`concentration × breathing rate × time`),
   - indoor PM2.5 with windows shut and with a HEPA purifier,
   - N95 effect on a 1-hour walk,
   - commute swaps with weekly and yearly CO₂ and tailpipe PM2.5 saved,
   - cooking-fuel smoke and heating safety alerts (carbon monoxide from an angithi, NO₂ from unflued gas heaters).
4. **Gemini writes the plan.** The facts go to Gemini (`gemini-3.5-flash-lite` by default) with structured JSON output against a zod schema. The system prompt forces it to quote only the given numbers, tailor to the household and budget, and stay within public-health advice.
5. **Try a change, see the effect.** A client-side simulator lets the family switch commute modes, toggle a purifier or move their walk and see the numbers update instantly, with no extra requests.
6. **Ask follow-up questions.** A streamed Q&A box answers questions like "Is it safe for my kids to play outside after school?" using the same server-built facts.

If Gemini is down, slow, not configured or returns something that fails validation, the app falls back to a rule-based plan with the same shape and the same numbers. The UI labels which one you are seeing.

## How it works

```
Browser ──POST /api/plan {profile}──▶ Route handler
                                       ├─ zod validation, 8 KB body limit, per-IP rate limit
                                       ├─ getAirReport(city)   "use cache", 10 min  ──▶ Open-Meteo
                                       ├─ buildInsights(profile, report)            (pure functions)
                                       ├─ generatePlan(facts)  structured output    ──▶ Gemini
                                       │     └─ on failure: buildFallbackPlan()
                                       └─ LRU cache per (forecast hour, profile)
        ◀── { report, insights, plan, source }

Browser ──POST /api/ask {profile, question}──▶ facts rebuilt on the server ──▶ Gemini stream ──▶ text/plain stream
```

| Folder | What lives there |
| --- | --- |
| `src/lib/air` | AQI bands, Open-Meteo client with response validation |
| `src/lib/domain` | Profile schema, risk, windows, impact maths, insights, plan schema, fallback plan |
| `src/lib/ai` | Prompt building (facts block, injection-safe user text) and the Gemini client |
| `src/lib/server` | Cached air service, plan service (dependency-injected), rate limiter, LRU, JSON helpers |
| `src/app/api` | `plan` and `ask` route handlers |
| `src/components` | Form, air report, forecast chart, plan, impact simulator, ask panel |
| `tests` | Vitest unit and component tests, Playwright end-to-end and axe accessibility tests |

## Security

- The Gemini key lives only on the server (`server-only` import guard). The browser talks only to this app; CSP `connect-src 'self'`.
- Every request body is size-limited and validated with strict zod schemas (unknown keys rejected, numbers bounded, city limited to letters).
- User free text is stripped of `<` `>` and wrapped in tags the system prompt marks as data, to blunt prompt injection. Model output is schema-validated before use.
- `/api/ask` rebuilds facts on the server, so a client cannot feed fake numbers to the model.
- Per-IP rate limits (10 plans/min, 20 questions/min), upstream timeouts, generic error messages.
- Security headers: CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, strict referrer and permissions policies.

## Efficiency

- Air data is cached with Next.js `"use cache"` for 10 minutes per city; Gemini plans are cached per forecast hour and profile, so repeat visits cost no AI call.
- One Gemini call per plan, with a 20 s timeout; follow-up answers stream so text shows at once.
- The page is prerendered static; only the two API routes run on demand. The simulator is pure client maths on numbers already sent.
- Window search is a single O(n) sliding sum.

## Accessibility

- Semantic landmarks, skip link, one `h1`, labelled fields and fieldsets, 44 px touch targets, visible focus rings.
- Results and streamed answers are announced through `aria-live` regions; errors use `role="alert"`.
- The forecast bar chart has a screen-reader table with exact values. Colour is never the only signal (labels sit next to every band colour).
- Respects `prefers-reduced-motion` and `prefers-color-scheme` (light and dark).
- Checked with axe in the Playwright suite.

## Running it

```bash
pnpm install
cp .env.example .env.local   # add GEMINI_API_KEY
pnpm dev                      # http://localhost:3000

pnpm test        # unit + component tests (Vitest)
pnpm test:e2e    # end-to-end + axe (Playwright, mocks the API, no key needed)
pnpm lint && pnpm typecheck && pnpm build
```

| Variable | Required | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | No (falls back to rules) | Google AI Studio key |
| `GEMINI_MODEL` | No | Defaults to `gemini-3.5-flash-lite` |

## Assumptions

- **AQI scale.** Open-Meteo returns the US EPA AQI, so the app uses it everywhere. India's NAQI uses different breakpoints; PM2.5 in µg/m³ is shown next to it so either reading makes sense.
- **Forecast windows** use hourly PM2.5 because the US AQI is a 24-hour rolling average and hides the hour-to-hour swings that matter for planning a walk.
- **Emission and exposure factors** are published averages, used to show the size of a choice, not to audit anyone:
  - CO₂ per passenger-km: petrol car 0.14, diesel 0.15, CNG 0.11, two-wheeler 0.04, auto 0.06, bus 0.015, metro 0.02 kg (India GHG Program / ICCT ranges).
  - Indoor/outdoor PM2.5 ratio in closed winter homes: 0.7 (Delhi studies report 0.5 to 0.9).
  - HEPA purifier sized for the room: about 60% less indoor PM2.5. Fitted N95 in real use: about 80% less inhaled PM2.5.
  - Breathing rate: 0.5 m³/h at rest, 1.6 m³/h exercising (US EPA Exposure Factors Handbook).
  - 22 µg/m³ of PM2.5 for a day ≈ one cigarette (Berkeley Earth). WHO 24-hour PM2.5 guideline: 15 µg/m³.
  - Kitchen PM2.5 added while cooking: biomass ~500, kerosene ~150, LPG/PNG ~25, induction ~5 µg/m³ (WHO household air pollution ranges).
  - A mature tree takes up about 21 kg CO₂ a year.
- A commute is a return trip on each listed day; a year has 46 working weeks. Walking is offered only for trips up to 2.5 km and cycling up to 8 km.
- Daytime planning hours are 06:00 to 21:00 local time.
- Rate limits are in memory per server instance, which is enough for a demo; a shared store (e.g. Redis) would be used at scale.
- Advice is general public-health guidance, not medical advice.
