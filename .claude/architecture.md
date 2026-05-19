# Architecture

## Request lifecycle

```
browser
  ↓
edge proxy ([proxy.ts](../proxy.ts))
  – cookie-presence check (sb-*-auth-token)
  – redirect to /login if missing, /dashboard if already authed and on /login
  ↓
RootLayout ([app/layout.tsx](../app/layout.tsx))
  – font setup, <html>/<body>, mounts <Providers>
  ↓
Providers ([app/providers.tsx](../app/providers.tsx))
  – <ThemeProvider> (next-themes, dark-default)
  – <SWRConfig> (global fetcher = swrFetcher from lib/api.ts)
  – <AuthSessionProvider> (single Supabase subscription)
  – <Toaster>
  ↓
Route group:
  – /(admin)/* → <AdminLayout> → <AdminShell> (auth+role gate; redirects to /login or /forbidden)
  – /login → renders bare (no shell)
  – /forbidden → renders bare (no shell)
  ↓
Page component ('use client')
  – useSWR for reads
  – api('POST'|'PATCH'|'DELETE', url, body) for writes
  – useSWRConfig().mutate(key) for invalidation
```

## Route groups

| Group | Folder | Purpose |
|---|---|---|
| `(admin)` | [app/(admin)/](<../app/(admin)/>) | All authenticated admin pages. Wrapped in `<AdminShell>`. |
| `login` | [app/login/](../app/login/) | Pre-auth screen. Public. |
| `forbidden` | [app/forbidden/](../app/forbidden/) | Authed but not admin. Public for navigation. |

The `(admin)` parentheses mean "group, not URL segment" — so `/(admin)/users/page.tsx` is served at `/users`, not `/(admin)/users`.

## The two-layer auth gate

(See [auth.md](auth.md) for the deeper dive.)

**Layer 1 — Edge proxy** ([proxy.ts](../proxy.ts)): cheap cookie-presence check. Bounces unauthenticated requests to `/login` before React even mounts. Does NOT validate the cookie; that's the SDK's job.

**Layer 2 — AdminShell** ([components/admin-shell.tsx](../components/admin-shell.tsx)): runs client-side after `useAuthSession()` resolves. If the session is invalid → `/login`. If valid but `profile.user_role !== 'admin'` → `/forbidden`. While loading, renders a "Loading admin…" placeholder so children never see a half-authed state.

Both layers are required. The edge proxy stops random visitors; the AdminShell stops authed non-admins.

## Provider order matters

`SWRConfig` wraps `AuthSessionProvider` (not the other way around) so that any descendant hook can call `useSWRConfig()` even before auth resolves. The fetcher itself reads the Supabase session inside each call — it doesn't capture it at provider mount.

## Force-dynamic on (admin) layout

[app/(admin)/layout.tsx](<../app/(admin)/layout.tsx>) has `export const dynamic = 'force-dynamic'`. Without it, Next.js would try to statically render the layout at build time, where there's no Supabase session — the auth gate would crash. `force-dynamic` makes every render server-evaluated (well, technically the layout still mounts on the client; this just tells Next not to try compiling it as static).

## What's not yet implemented

- **SSE / realtime** — admin currently polls. The user-facing client subscribes to `/api/events`; admin doesn't.
- **Offline / queued mutations** — assume online. The whole UI is gated on Supabase being reachable.
- **Bulk selection** — every action is per-row. No multi-select / batch operations except the bulk endpoints in [billing/page.tsx](<../app/(admin)/billing/page.tsx>).
