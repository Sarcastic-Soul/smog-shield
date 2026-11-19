# Testing

Two test tools, three levels:

| Level                          | Tool                                          | Where                                                 | Network?                       | Needs `GEMINI_API_KEY`? |
| ------------------------------ | --------------------------------------------- | ----------------------------------------------------- | ------------------------------ | ----------------------- |
| Unit (logic, services, routes) | Vitest, `node` environment                    | [`tests/unit`](../tests/unit) (all but `components/`) | No                             | No                      |
| Component                      | Vitest + Testing Library, `jsdom` environment | [`tests/unit/components`](../tests/unit/components)   | No                             | No                      |
| End-to-end                     | Playwright + axe-core                         | [`tests/e2e`](../tests/e2e)                           | No (API mocked in the browser) | No                      |

The two Vitest projects (`node` and `components`) are set in [`vitest.config.mts`](../vitest.config.mts).

## Strategy

- **Test the maths hardest.** Every number shown to users comes from `src/lib/domain`, which is pure. These tests use fixed inputs and exact expected outputs, so a wrong factor or an off-by-one in a window is caught at once.
- **Test behaviour, not wiring.** Services are factories that take their dependencies ([DECISIONS.md #7](DECISIONS.md#7-factories-and-dependency-injection)), so tests pass fakes in and check what comes out: which events stream, what gets cached, when Gemini is skipped.
- **Test the failure paths.** Model overloads, timeouts, invalid JSON, an open circuit breaker, upstream 5xx, unknown cities, oversized bodies and cut-off streams all have tests.
- **One realistic fixture.** [`tests/fixtures/delhi.ts`](../tests/fixtures/delhi.ts) is a winter day in New Delhi with PM2.5 between 45 and 120 µg/m³: cleanest around 12:00-14:00, dirtiest around 19:00-21:00. [`profiles.ts`](../tests/fixtures/profiles.ts) returns a fresh copy each call, so one test cannot change another's input. [`results.ts`](../tests/fixtures/results.ts) builds a full `PlanResult` used by component and e2e tests.

## Layout

`tests/unit` mirrors `src`:

| `src` folder           | Tests                                                   | What they check                                                                                                                                                                                                                             |
| ---------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/air`          | [`tests/unit/air`](../tests/unit/air)                   | AQI bands and EPA 2024 PM2.5 breakpoints; Open-Meteo parsing, dominant pollutant, 24-hour slice and 3-day outlook; zod rejection of bad payloads; timeout and single retry in `getJson`; geocoder "not found"                               |
| `src/lib/domain`       | [`tests/unit/domain`](../tests/unit/domain)             | Risk bands and the one-step bump for sensitive members; window search (daytime only, same day); dose, indoor, mask and emission maths; insights; profile and plan schemas                                                                   |
| `src/lib/domain/rules` | [`tests/unit/domain/rules`](../tests/unit/domain/rules) | Each rules-plan section (routine, indoor, swaps, community, groups, text helpers) and `reconcilePlan` top-ups                                                                                                                               |
| `src/lib/ai`           | [`tests/unit/ai`](../tests/unit/ai)                     | FACTS block content, prompt fencing, `sanitizeUserText`, system instruction rules, model chain order and retry rules, circuit breaker, Gemini client with a fake `models` object                                                            |
| `src/lib/server`       | [`tests/unit/server`](../tests/unit/server)             | TTL cache (shared in-flight promise, expiry, error eviction), LRU order, rate limiter windows and key cap, HTTP helpers (cross-site check, byte cap, 413/415/422), CSP string, air service cache keys, plan service event order and caching |
| `src/app/api`          | [`tests/unit/api`](../tests/unit/api)                   | Both route handlers end to end in Node: status codes, NDJSON order, streaming text, rate limits, cross-site refusal                                                                                                                         |
| `src/lib/client`       | [`tests/unit/client`](../tests/unit/client)             | NDJSON line splitting across chunk borders, missing `final` line, error messages, saved profile with blocked or stale storage                                                                                                               |
| `src/components`       | [`tests/unit/components`](../tests/unit/components)     | Every component: labels, live regions, focus, `lang`/`dir` on generated text, simulator updates, error and loading states                                                                                                                   |

## Fakes versus mocks

- **Fakes through factories (preferred).** `createPlanService`, `createAirService` and `createAssistant` take plain functions. For example [`plan-service.test.ts`](../tests/unit/server/plan-service.test.ts) passes `vi.fn` stand-ins for `getAirReport` and `generatePlan`, and [`gemini.test.ts`](../tests/unit/ai/gemini.test.ts) passes a fake `models` object with `generateContent` and `generateContentStream`. Time-based code (`createTtlCache`, `createRateLimiter`, `createCircuitBreaker`) takes a `now` argument, so tests move time by hand.
- **Module mocks (only at the edges).** The route tests replace `@/lib/server/services` with the same wiring built from the real `createPlanService` and `createRateLimiter`, only with fake air and Gemini functions. Component tests mock `@/lib/client/api` so no `fetch` runs.
- **`server-only`** is aliased to an empty module ([`tests/mocks/empty.ts`](../tests/mocks/empty.ts)) so server modules can load under Vitest.

## End-to-end

Playwright ([`playwright.config.ts`](../playwright.config.ts)) builds the app and starts it on port 3200. Each test mocks `/api/plan` and `/api/ask` at the browser with `page.route` ([`tests/e2e/helpers.ts`](../tests/e2e/helpers.ts)). The plan mock sends a real NDJSON body (a `draft` line then a `final` line), so the streaming client code runs for real. No key or network is needed.

| Spec                                                  | Covers                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`plan-flow.spec.ts`](../tests/e2e/plan-flow.spec.ts) | Full flow: submit, AQI, forecast, routine, swaps, community section, 3-day outlook, "tomorrow" tags, building/ward scaling, Urdu `dir="rtl"`, focus moves to results, simulator, ask panel, 404 and cut-off stream errors, bad city blocked before the API call, saved profile, double-click sends one request |
| [`a11y.spec.ts`](../tests/e2e/a11y.spec.ts)           | axe scans (WCAG 2.0/2.1 A and AA tags) of the empty, results and error states, failing on any serious or critical issue; skip link is the first tab stop; keyboard-only path to a plan; no sideways scroll at 390 px width                                                                                     |
| [`security.spec.ts`](../tests/e2e/security.spec.ts)   | CSP header has a nonce and no `'unsafe-inline'` or `'unsafe-eval'` in `script-src`; a fresh nonce per request; every page script carries the nonce; zero CSP violations in the console while the app hydrates; API errors are `no-store`; a cross-site API call gets 403                                       |

## Coverage

Coverage uses the V8 provider over `src/lib/**` and `src/components/**`. The build fails below these thresholds (from [`vitest.config.mts`](../vitest.config.mts)):

| Metric     | Minimum |
| ---------- | ------- |
| Lines      | 85%     |
| Statements | 85%     |
| Functions  | 80%     |
| Branches   | 75%     |

## Continuous integration

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) runs on every push and pull request: lint, both type checks, the Prettier check, unit tests with the coverage thresholds, a production build, and then the Playwright suite with axe scans.

Tests have their own [`tests/tsconfig.json`](../tests/tsconfig.json). It extends the root config and turns off only `noUncheckedIndexedAccess`, so assertions like `mock.calls[0][0]` stay readable while `src` keeps the strictest index checks.

## Commands

```bash
pnpm test            # all unit and component tests, once
pnpm test:watch      # watch mode
pnpm test:coverage   # with coverage report and thresholds
pnpm test:e2e        # Playwright: builds, starts on :3200, runs e2e + axe
pnpm typecheck       # tsc --noEmit
pnpm lint            # ESLint
```

Run one file: `pnpm vitest run tests/unit/domain/windows.test.ts`. Run one project: `pnpm vitest run --project components`.
