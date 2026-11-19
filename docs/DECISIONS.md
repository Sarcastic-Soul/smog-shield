# Design decisions

Short records of the main choices in this codebase. Each one says what the problem was, what we chose, and what that costs.

## 1. Numbers come from the rule engine, not the LLM

**Context.** Families act on numbers: "move your walk to 12:00 and breathe 62% less PM2.5". A language model can get arithmetic wrong or make up a figure that sounds right.

**Decision.** Every figure is computed in [`src/lib/domain`](../src/lib/domain) by pure functions: risk ([`risk.ts`](../src/lib/domain/risk.ts)), windows ([`windows.ts`](../src/lib/domain/windows.ts)), inhaled dose and indoor PM2.5 ([`exposure.ts`](../src/lib/domain/exposure.ts)), CO₂ and tailpipe PM2.5 ([`emissions.ts`](../src/lib/domain/emissions.ts)), all joined in [`buildInsights`](../src/lib/domain/insights.ts). [`buildFacts`](../src/lib/ai/facts.ts) writes them into a labelled text block, and the system prompt tells Gemini to use only those numbers ([`instructions.ts`](../src/lib/ai/instructions.ts)).

**Consequences.** The maths is unit tested with known inputs. Gemini's job is wording, ordering and tailoring, which it is good at. The impact simulator in the browser reuses the same functions, so its numbers match the plan. The cost: any new kind of number needs code in the domain first.

## 2. One zod plan schema is the contract

**Context.** Three things produce or read a plan: Gemini, the rule-based fallback and the UI. If their shapes drift, the page breaks only when one path is taken.

**Decision.** [`planSchema`](../src/lib/domain/plan.ts) is the single definition. Gemini gets `planJsonSchema` (made with `z.toJSONSchema`) as its structured output schema. Its reply is checked with `planSchema.safeParse`. `buildFallbackPlan` returns the `Plan` type. `PLAN_LIMITS` sets list sizes for the schema, the rules plan and reconciliation alike.

**Consequences.** The UI handles one shape. A bad model reply is caught on the server, not in the browser. Field descriptions in the schema double as instructions to the model.

## 3. Hourly PM2.5 for windows, not the 24-hour AQI

**Context.** The official US AQI is a 24-hour rolling average. It barely moves within a day, so it cannot say when to go out.

**Decision.** [`findWindows`](../src/lib/domain/windows.ts) ranks 2-hour daytime windows (06:00 to 21:00, same day) by hourly PM2.5, using one O(n) sliding sum. The hourly AQI shown for each window comes from [`pm25ToAqi`](../src/lib/air/aqi.ts) with the EPA 2024 PM2.5 breakpoints. The headline AQI is still Open-Meteo's official value.

**Consequences.** Windows show real swings (in the Delhi test fixture, 45.5 µg/m³ at 12:00-14:00 against 119 µg/m³ at 19:00-21:00). The label says "hourly AQI" so it is not confused with the official number.

## 4. Stream a rules draft, then Gemini

**Context.** At peak times Gemini can take 10 to 20 seconds. A blank screen that long loses people.

**Decision.** `/api/plan` returns NDJSON. [`planEvents`](../src/lib/server/plan-service.ts) yields the rules plan as a `draft` line straight after the air data arrives, then a `final` line with Gemini's plan (or the rules plan again on failure). Cached plans skip the draft and send one `final` line.

**Consequences.** Useful advice shows in about a second. The client must handle two events and a stream that ends early, which [`requestPlan`](../src/lib/client/api.ts) does. Air-data errors are raised before streaming starts, so they still return real status codes (404, 502).

## 5. Model chain plus circuit breaker

**Context.** Preview and lite models return 503 or 429 under load. Waiting on a model that is down wastes the user's time.

**Decision.** [`withModelChain`](../src/lib/ai/model-chain.ts) tries `gemini-3.5-flash-lite`, then `gemini-3.1-flash-lite`, then `gemini-3-flash-preview` (`DEFAULT_MODELS` in [`gemini.ts`](../src/lib/ai/gemini.ts)). It moves on only for retryable errors (503, 429, `UNAVAILABLE`, `RESOURCE_EXHAUSTED`, timeouts), with a 15 s limit per attempt inside a 26 s overall budget ([`budgets.ts`](../src/lib/ai/budgets.ts)). [`createCircuitBreaker`](../src/lib/ai/circuit-breaker.ts) opens after 3 failures in a row and skips Gemini for 60 s. `GEMINI_MODEL` can put a different model first.

**Consequences.** Most overloads are absorbed by a backup model. When all are down, users get the rules plan at once instead of after a timeout. Both pieces are small, pure and tested with fake time.

## 6. Nonce CSP set in the proxy, not experimental SRI

**Context.** A strict `script-src` stops injected scripts. Next.js offers two ways: a per-request nonce, or hash-based Subresource Integrity, which its own docs mark as experimental.

**Decision.** [`src/proxy.ts`](../src/proxy.ts) makes a fresh nonce for each page request and sets the policy from [`buildCsp`](../src/lib/server/csp.ts): `'nonce-…' 'strict-dynamic'`, no `'unsafe-inline'` for scripts, `object-src 'none'`, `frame-ancestors 'none'`. API responses get `default-src 'none'` from [`next.config.ts`](../next.config.ts). The page calls `connection()` so it renders per request.

**Consequences.** It uses the stable, documented path. The cost is that the page cannot be statically cached, which is fine because it is small and the slow work is in the API. Styles keep `'unsafe-inline'` because React `style` props (chart bar heights, band colours) are inline style attributes that nonces cannot cover. [`tests/e2e/security.spec.ts`](../tests/e2e/security.spec.ts) checks the header, a fresh nonce per request, a nonce on every script and zero CSP violations.

## 7. Factories and dependency injection

**Context.** The interesting logic (caching, fallbacks, streaming order) sits between two network services. Tests that hit the network are slow and flaky.

**Decision.** Each service is a factory that takes its dependencies: `createAirService({ geocode, fetchReport })`, `createPlanService({ getAirReport, generatePlan })`, `createAssistant({ models, modelNames, breaker })`. The Open-Meteo functions take a `fetcher` argument. Only [`services.ts`](../src/lib/server/services.ts) wires in the real ones. Time-based helpers take an optional `now`.

**Consequences.** Service tests such as [`plan-service.test.ts`](../tests/unit/server/plan-service.test.ts) and [`gemini.test.ts`](../tests/unit/ai/gemini.test.ts) pass fake functions straight into the factory and check behaviour (for example "a failed Gemini call is not cached as a hit") with no network. Adding a new data source means writing one function with the same signature.

## 8. In-memory caches and rate limits

**Context.** The demo runs on Vercel serverless functions. Adding Redis would add a service, a secret and latency for little gain at this scale.

**Decision.** Caches ([`ttl-cache.ts`](../src/lib/server/ttl-cache.ts) over [`lru.ts`](../src/lib/server/lru.ts)) and fixed-window rate limits ([`rate-limit.ts`](../src/lib/server/rate-limit.ts)) live in memory, with size caps. The client key is Vercel's `x-real-ip`, with the first `x-forwarded-for` hop as a fallback ([`clientKey`](../src/lib/server/http.ts)).

**Consequences.** Each instance has its own counters and caches, so limits are per instance and a cold start begins empty. At larger scale we would move the plan cache and rate limits to a shared store such as Redis (or Vercel KV) behind the same `TtlCache` and `RateLimiter` interfaces, and add a per-user quota. Because the interfaces are small, callers would not change.
