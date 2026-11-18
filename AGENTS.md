<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules

- Every number shown to users comes from `src/lib/domain` (pure, tested functions). Gemini only explains those facts; never let it compute figures.
- Keep `planSchema` (`src/lib/domain/plan.ts`) as the single contract between Gemini, the rule-based fallback and the UI.
- Server-only code (`src/lib/ai/gemini.ts`, `src/lib/server/*`) must never be imported by client components.
- Validate every request body with a strict zod schema via `readJson`.
- Before committing: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e`.
