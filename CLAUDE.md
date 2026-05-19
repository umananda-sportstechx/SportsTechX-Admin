@AGENTS.md

# SportsTechX Admin — Claude Entry Point

Internal admin tool for SportsTechX. Next.js 16 App Router + React 19 + TypeScript + Tailwind 4 + Supabase JS + SWR. Talks to the NestJS backend at `BACKEND_URL` via the `/api/*` rewrite in [next.config.ts](next.config.ts). Runs on port **3001** (user-facing client lives on 3000).

## Read first (in order)

1. [.claude/stack.md](.claude/stack.md) — what's installed
2. [.claude/architecture.md](.claude/architecture.md) — provider stack, App Router groups, auth gate
3. [.claude/rules.md](.claude/rules.md) — hard guardrails
4. [.claude/conventions.md](.claude/conventions.md) — api(), useSWR, mutation patterns
5. [.claude/auth.md](.claude/auth.md) — the two-layer admin gate (edge proxy + AdminShell)
6. [.claude/data-fetching.md](.claude/data-fetching.md) — read before writing fetches
7. [.claude/pages.md](.claude/pages.md) — per-page surface index

## When you need to…

| Task | Go to |
|---|---|
| Fetch data on a page | [.claude/data-fetching.md](.claude/data-fetching.md) |
| Send a write | [.claude/data-fetching.md#writes](.claude/data-fetching.md#writes) |
| Understand who gets in | [.claude/auth.md](.claude/auth.md) |
| Find which page does X | [.claude/pages.md](.claude/pages.md) |
| Style something | [.claude/conventions.md#styling](.claude/conventions.md#styling) |

## Hard rules (full list in [rules.md](.claude/rules.md))

- **Every page lives under `app/(admin)/`** so it inherits `AdminShell` (auth + admin-role gate). New routes go there or they're unprotected.
- **No `@tanstack/react-query` imports.** Removed (upstream security incident, `5.100.x` compromise). Use `useSWR` + `useSWRConfig().mutate()` + the project's `api()` helper.
- **All HTTP goes through `api()` from [lib/api.ts](lib/api.ts).** Attaches the Supabase auth header automatically; bare `fetch()` skips that and gets rejected by the server.
- **Don't roll your own Supabase client** — use `getSupabaseBrowser()` from [lib/supabase.ts](lib/supabase.ts).
- **All pages stay `'use client'`** — this codebase has no RSC data fetching.
- **Don't render PII in URL query params or third-party scripts.** This is an internal tool — assume the auditor is watching.

## Commands

```bash
npm run dev          # next dev on :3001 (8GB heap)
npm run build        # next build
npm run start        # serve build on :3001
npm run lint         # eslint
npx tsc --noEmit     # typecheck
```

Dev server: `http://localhost:3001`. Backend at `BACKEND_URL` (defaults to `http://localhost:5000`).
