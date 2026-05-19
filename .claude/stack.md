# Stack at a Glance

Internal admin app. Smaller surface than the user-facing client — no shadcn, no command palette, no SSE, no charts (yet). Designed to be spartan.

| Layer | Tech | Where |
|---|---|---|
| Runtime | Next.js 16 (App Router, Turbopack) | [next.config.ts](../next.config.ts) |
| UI library | React 19 | — |
| Language | TypeScript 5 (strict) | [tsconfig.json](../tsconfig.json) |
| Styling | Tailwind CSS 4 + design tokens | [app/globals.css](../app/globals.css), [app/design-system.css](../app/design-system.css) |
| Data fetching | **SWR** (`^2.x`) — replaced TanStack Query | [lib/api.ts](../lib/api.ts), [app/providers.tsx](../app/providers.tsx) |
| Auth | Supabase JS (`@supabase/supabase-js`) + Supabase SSR | [lib/supabase.ts](../lib/supabase.ts), [hooks/use-auth-session.tsx](../hooks/use-auth-session.tsx) |
| Forms | None — admin uses raw `<input>` / `<select>` with `useState`. No react-hook-form, no zod resolvers. | — |
| Icons | lucide-react | — |
| Toast | sonner | mounted in [app/providers.tsx](../app/providers.tsx) |
| Theme | next-themes (dark default, no toggle) | — |
| Charts | recharts (installed, not yet used) | — |

## What it talks to

- **Backend**: NestJS server on `BACKEND_URL` (defaults to `http://localhost:5000`). Same-origin `/api/*` paths get proxied by [next.config.ts](../next.config.ts) — no CORS preflight in dev.
- **Supabase**: directly for auth. Uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Profile state (including `user_role` for admin gating) comes from the backend's `/api/profiles/me`, NOT a direct Supabase table read.

## What's deliberately NOT here

- **No shadcn/ui.** The user-facing client uses it. Admin uses raw HTML + design-token classes (`btn`, `chip`, `card`, `tag`, `data-table`, `search-input`) defined in [design-system.css](../app/design-system.css).
- **No `qk.*` query-key factory.** SWR keys are inline tuples `[path, params?]`. Five files don't justify a separate module.
- **No service worker, no PWA.** Internal tool, no offline use.
- **No analytics.** Admin actions are server-side audit-logged; we don't double-record on the client.

## Required env at runtime

| Var | Source |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `BACKEND_URL` (build-time) | Used by [next.config.ts](../next.config.ts) rewrite. Optional — defaults to `http://localhost:5000`. |

No `.env.example` ships here; the user-facing client's covers the same Supabase keys.
