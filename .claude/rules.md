# Hard Rules

Non-negotiable. Each rule has a one-line "why" so you can judge edge cases instead of blindly following.

## Auth / access

- **Every new page goes under `app/(admin)/`** so it inherits `<AdminShell>` (the auth + admin-role gate). Pages outside this group are publicly reachable. Why: the gate is the only thing keeping non-admins out.
- **Never bypass `<AdminShell>`** by checking auth manually inside a page. Why: the shell handles the loading flicker correctly; per-page checks usually flash content briefly.
- **Never check `user_type` for admin gating.** Use `user_role === 'admin'`. Why: `user_type` is the subscription tier (`free | growth | pro`); admins can be on any tier. The earlier bug shipped a check on `user_type==='admin'` which is never true.

## Data fetching

- **No `@tanstack/react-query` imports.** Removed (security incident, 5.100.x). Use `useSWR` + `useSWRConfig().mutate()` + `api()` directly. Why: the package was compromised; reintroducing it pulls the same transitive tree.
- **All HTTP goes through `api()`** from [lib/api.ts](../lib/api.ts). Why: it attaches the Supabase bearer header. Bare `fetch()` skips auth and the backend returns 401.
- **SWR keys are tuples `[path, params?]`** — the global `swrFetcher` understands the shape. Don't pass raw URL strings unless there are no params. Why: cache identity depends on the full tuple.
- **Use `useSWRConfig().mutate((key) => Array.isArray(key) && key[0] === '/api/foo')` for prefix invalidation.** Why: this matches every cached call to `/api/foo` regardless of params.

## Mutations

- **Inline `useState + try/catch/finally`** for write operations — no `useMutation` hook. Why: SWR doesn't ship one, and rolling our own is more code than the inline pattern.
- **Always show a toast on success and on error.** Internal users get no other signal that an action took effect.
- **Always invalidate the list after a write** that changes a list item. Why: SWR doesn't auto-refetch on mutation.

## Supabase

- **`getSupabaseBrowser()` is the only acceptable client constructor.** Why: single client instance; per-component instantiation creates duplicate auth subscriptions.
- **Don't query Supabase tables directly from the admin app.** Hit the backend's `/api/admin/*` endpoints. Why: the backend enforces RBAC, audit logging, and rate limiting; direct table queries skip all three.

## Styling

- **Use the design-token classes** (`btn`, `chip`, `card`, `tag`, `data-table`, `search-input`, `filter-bar`) defined in [app/design-system.css](../app/design-system.css). Why: shared visual language with the user-facing client.
- **Don't import shadcn/ui or Radix components.** This codebase is deliberately minimal. Why: shadcn lives in the client app; pulling it here doubles bundle size with no benefit.
- **Inline styles are fine** for one-off layout (`style={{ display: 'flex', gap: 8 }}`) — admin is utilitarian. Don't reach for CSS modules.

## State / forms

- **Forms use `useState` + `<input>` + onChange.** No react-hook-form. Why: admin forms are <10 fields each; a library is overkill.
- **Validate on submit, not on blur.** The backend does the real validation; client-side is best-effort.

## Routing

- **All pages stay `'use client'`** — no RSC data fetching. Why: every page reads from `useSWR` + `useAuthSession`, both client-only.
- **`(admin)/layout.tsx` must keep `export const dynamic = 'force-dynamic'`.** Why: without it, Next tries to render the layout at build time and crashes on missing Supabase session.

## Logging & PII

- **Don't `console.log` Supabase tokens, profile_ids, or emails.** Even in dev — they get scraped by error trackers in prod.
- **Don't pass user emails in URL query params.** Anything in the URL ends up in server logs, browser history, and referer headers.

## Things to ask before doing

- Adding a new top-level provider in `app/providers.tsx`.
- Changing provider order — current order is intentional.
- Reintroducing `@tanstack/react-query` for any reason.
- Adding a non-admin route inside `app/(admin)/`. (If it's a public route, it goes outside the group.)
- Switching the styling system away from design tokens + Tailwind utility classes.
