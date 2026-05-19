# Auth

Two layers between an unauthenticated visitor and an admin page. Both are required; either alone is insufficient.

## Layer 1 — Edge proxy

File: [proxy.ts](../proxy.ts).

Runs on every request (matcher excludes static assets only). Performs a cheap **cookie-presence check** — does the request carry a Supabase auth cookie (`sb-*-auth-token`)? Does NOT validate the cookie's signature or expiry; that's the SDK's job.

| State | Behavior |
|---|---|
| No cookie, hits a public path (`/login`, `/forbidden`, `/auth`) | Pass through |
| No cookie, hits anything else | 302 → `/login?redirectTo=<original>` |
| Has cookie, hits `/login` | 302 → `/dashboard` (or `redirectTo` if present) |
| Has cookie, hits anything else | Pass through |

The proxy's job is purely to stop random visitors from rendering admin pages in their browser. It's NOT a security boundary — the cookie could be expired or revoked.

## Layer 2 — AdminShell

File: [components/admin-shell.tsx](../components/admin-shell.tsx).

Wraps everything under `app/(admin)/`. Runs client-side after React mounts. Reads two hooks:

- `useAuthSession()` — current Supabase session
- `useIsAdmin()` — `profile.user_role === 'admin'`, sourced from `GET /api/profiles/me`

| State | Behavior |
|---|---|
| `authLoading` or `adminLoading` | Renders "Loading admin…" placeholder |
| `session === null` | `router.replace('/login')` |
| Session OK, `isAdmin === false` | `router.replace('/forbidden')` |
| Session OK + `isAdmin === true` | Renders the rail + topbar + children |

The "Loading admin…" placeholder is important — without it, children render briefly with no data, then the redirect fires, causing a flicker.

## The two distinct concepts

| Field | Source | What it gates |
|---|---|---|
| `user_role` | `profiles.user_role` on the backend | Admin panel access (`'admin'` or `'user'`) |
| `user_type` | `profiles.user_type` on the backend | Subscription tier (`'free' \| 'growth' \| 'pro'`) — drives feature gating in the **user-facing client app**, NOT the admin app |

**The earlier bug** in this codebase checked `user_type === 'admin'`. That column never holds `'admin'`, so admins kept getting bounced to `/forbidden`. The fix: use `user_role`. The hook now documents the distinction; don't reintroduce the bug.

## Sign-out

[components/admin-shell.tsx](../components/admin-shell.tsx) topbar button → calls `signOut()` from `useAuthSession()` → `supabase.auth.signOut()` → SDK clears the cookie → component re-renders → `session === null` → `router.replace('/login')`.

No need to manually clear SWR cache here — when the next request 401s, the user is redirected before they see stale data. (The user-facing client app does a more aggressive logout because it has SSE subscriptions and a richer cache; admin doesn't need that complexity.)

## Backend authorization

Every admin route on the backend is decorated with `@RequireRole('admin')`. The guard reads the JWT `sub`, looks up the profile, and checks `user_role`. The admin app's role gate (Layer 2) mirrors that check — they read the same column.

**Implication**: if you bypass the AdminShell client-side (don't), the backend still rejects with 403. The shell exists for UX (no flash of admin content), not security.

## Adding a new admin role / split RBAC

Currently it's binary (`admin` vs `user`). If finer-grained roles ever land (e.g. `admin_billing`, `admin_data`, `admin_super`), they go in `user_role` as new enum values, and:

1. Backend: extend the `@RequireRole(...)` decorator to accept multiple roles.
2. Admin app: extend `useIsAdmin()` to return per-role flags, and gate individual nav items in [components/admin-shell.tsx](../components/admin-shell.tsx).

Don't try to do this from `user_type` — that column has different semantics.
