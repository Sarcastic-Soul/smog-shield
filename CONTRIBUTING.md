# Contributing

## Setup

You need Node.js and pnpm (the repo pins `pnpm@12.18.0` in `package.json`).

```bash
pnpm install
cp .env.example .env.local   # add GEMINI_API_KEY, or leave it empty to run on rules alone
pnpm dev                     # http://localhost:3000
```

No key is needed for tests. Without a key the app still works: plans come from the rule engine and the ask box returns a short "assistant is busy" message (503).

## Scripts

| Script                              | What it does                                                         |
| ----------------------------------- | -------------------------------------------------------------------- |
| `pnpm dev`                          | Dev server                                                           |
| `pnpm build` / `pnpm start`         | Production build and server                                          |
| `pnpm lint`                         | ESLint (`eslint-config-next` core web vitals + TypeScript rules)     |
| `pnpm typecheck`                    | `tsc --noEmit` with `strict: true`                                   |
| `pnpm test`                         | Vitest unit and component tests                                      |
| `pnpm test:watch`                   | Vitest in watch mode                                                 |
| `pnpm test:coverage`                | Tests with V8 coverage and enforced thresholds                       |
| `pnpm test:e2e`                     | Playwright end-to-end and axe tests (builds and serves on port 3200) |
| `pnpm format` / `pnpm format:check` | Prettier write / check                                               |

See [docs/TESTING.md](docs/TESTING.md) for what each test level covers.

## Code style

- **Prettier**, `printWidth: 120` ([`.prettierrc`](.prettierrc)). Run `pnpm format` before committing.
- **ESLint** flat config in [`eslint.config.mjs`](eslint.config.mjs).
- **TypeScript strict mode** ([`tsconfig.json`](tsconfig.json)). Import from `src` with the `@/` alias.
- Small modules with one job each. Prefer factories that take their dependencies over modules that reach for globals ([docs/DECISIONS.md #7](docs/DECISIONS.md#7-factories-and-dependency-injection)).
- Comments explain _why_, in plain English.
- Icons: Phosphor (`@phosphor-icons/react`).

Compiler settings go beyond `strict`: `noUncheckedIndexedAccess`, `noImplicitOverride` and `noFallthroughCasesInSwitch` for `src`. ESLint adds `consistent-type-imports`, `eqeqeq` and `no-console` (server logs go through [`src/lib/log.ts`](src/lib/log.ts)). Imports use the `@/` alias everywhere.

## Project rules

These come from [`AGENTS.md`](AGENTS.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#dependency-rules):

1. **Every number shown to users comes from `src/lib/domain`** (pure, tested functions). Gemini only explains those facts; never let it compute figures.
2. **`planSchema` in [`src/lib/domain/plan.ts`](src/lib/domain/plan.ts) is the single contract** between Gemini, the rule-based fallback and the UI. Change it there, and the JSON schema sent to Gemini follows.
3. **Server-only code** (`src/lib/ai/gemini.ts`, `src/lib/server/*`) must never be imported by client components.
4. **Validate every request body** with a strict zod schema through `readJson` in [`src/lib/server/http.ts`](src/lib/server/http.ts).
5. **Keep the domain pure:** no `fetch`, environment variables or clock reads in `src/lib/domain`.
6. **Keep zod out of the first page load:** client components import options and labels from `profile-options.ts`, not `profile.ts`, and use `import type` for domain types.
7. This is Next.js 16. Read the guide in `node_modules/next/dist/docs/` before using a Next.js API; some differ from older versions (for example the CSP nonce lives in `src/proxy.ts`).

## Pull request checklist

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs every check below on each push; keep it green.

- [ ] `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` all pass.
- [ ] `pnpm test:coverage` stays above the thresholds in [`vitest.config.mts`](vitest.config.mts).
- [ ] New logic has tests in the matching `tests/unit/<folder>` (the test tree mirrors `src`).
- [ ] New UI is reachable by keyboard, has labels, and passes the axe scans in [`tests/e2e/a11y.spec.ts`](tests/e2e/a11y.spec.ts).
- [ ] Any new figure is computed in `src/lib/domain` and added to the FACTS block, not written by the model.
- [ ] No secrets, `.env*` files or API keys in the diff.
- [ ] `pnpm format:check` passes.
- [ ] README or `docs/` updated if behaviour changed.
