# Data Fetching

Everything the admin app does over HTTP. **Read this before adding any `useSWR` or `api()` call.**

## The three pieces

1. **`api(method, url, body?)`** ([lib/api.ts](../lib/api.ts)) — single fetch helper. Attaches the Supabase bearer header. Throws `Error("<status>: <text>")` on non-2xx. Returns parsed JSON or `undefined` for empty responses.
2. **`swrFetcher`** ([lib/api.ts](../lib/api.ts)) — global SWR fetcher wired in [app/providers.tsx](../app/providers.tsx). Accepts a tuple `[path, params?]` (preferred) or a bare string. Builds the URL via `buildUrl()`, then calls `api('GET', url)`.
3. **`useSWRConfig().mutate(matcher)`** — the invalidation API.

## Reading data

```tsx
import useSWR from 'swr';

interface ClaimsResponse { data: Claim[]; total: number; totalPages: number }

const { data, isLoading } = useSWR<ClaimsResponse>(
  ['/api/admin/claims', { status: 'pending', page, limit: 30 }],
  { dedupingInterval: 30_000 },
);
```

- First element of the tuple is the API path (`/api/...`).
- Second element is a params object that becomes the query string. `null`/`undefined`/`''` values are skipped.
- Pass `null` instead of the tuple to skip the fetch entirely (e.g. while waiting on auth):

```tsx
useSWR(session ? ['/api/admin/users'] : null);
```

### Loading semantics

SWR's `isLoading` is true on first load only. For "is there a refresh in flight right now" use `isValidating`. Most pages just use `isLoading`.

### Per-call options

`dedupingInterval` — minimum gap between identical requests. Default in [providers.tsx](../app/providers.tsx) is 60s; bump to 15-30s for queues you drain frequently.

`refreshInterval` — auto-poll. Used on `/performance/page.tsx` (30s). Don't add without a reason — admins refresh manually.

## Writes

Inline `useState + try/catch/finally + api() + mutate()`. No `useMutation` hook.

```tsx
import useSWR, { useSWRConfig } from 'swr';
import { api } from '@/lib/api';
import { toast } from 'sonner';

const { mutate } = useSWRConfig();
const [pending, setPending] = useState(false);

const create = async () => {
  setPending(true);
  try {
    await api('POST', '/api/admin/things', payload);
    toast.success('Created');
    void mutate((key) => Array.isArray(key) && key[0] === '/api/admin/things');
  } catch (e) {
    toast.error((e as Error).message);
  } finally {
    setPending(false);
  }
};
```

### When the row id matters

For per-row mutations (verify a claim, revoke a grant), track which row is in flight so only that row's button shows the spinner:

```tsx
const [pendingId, setPendingId] = useState<string | null>(null);
// ...
const verify = async (id: string) => {
  setPendingId(id);
  try { await api('POST', `/api/admin/claims/${id}/verify`); ... }
  finally { setPendingId(null); }
};
// In JSX:
<button disabled={pendingId === c.id} ...>
```

## Invalidation

`useSWRConfig().mutate` takes either an exact key or a matcher function.

| Pattern | Effect |
|---|---|
| `mutate(['/api/admin/users', { page: 1, limit: 30 }])` | Re-fetch THAT exact key |
| `mutate((key) => Array.isArray(key) && key[0] === '/api/admin/users')` | Re-fetch every cached call to `/api/admin/users` regardless of params |
| `mutate(() => true)` | Nuke the entire SWR cache (hard logout) |

After a write, prefix-invalidation (second pattern) is almost always what you want — pagination + filter combos mean the exact key probably isn't the one you just modified.

## The auth contract

`api()` reads the current Supabase session inline (no caching). If the user is signed out → no auth header → server returns 401 → `api()` throws.

There's no client-side refresh-and-retry loop here (unlike the user-facing client). The session is refreshed by Supabase's own auto-refresh in [hooks/use-auth-session.tsx](../hooks/use-auth-session.tsx). If a request 401s, the user is bounced to `/login` by the next render of `<AdminShell>`.

## What's deliberately NOT supported

- **Optimistic updates** — admin actions are infrequent and the round-trip is fast. SWR supports `mutate(key, optimisticData, { revalidate: false })` but no current call site uses it.
- **Pagination via `useSWRInfinite`** — pages use server pagination (`page` + `totalPages` in params). The list response includes `totalPages` so the page bar can use Prev/Next directly.
- **Suspense** — `<SWRConfig suspense>` would simplify some loading states but every page currently handles `isLoading` explicitly. Don't mix the two patterns.
