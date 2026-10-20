'use client';

import { SWRConfig, type Cache } from 'swr';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { AuthSessionProvider } from '@/hooks/use-auth-session';
import { swrFetcher, ApiError } from '@/lib/api';

/**
 * Bounded (LRU) SWR cache.
 *
 * SWR's default cache is an unbounded `Map`, and with `keepPreviousData: true`
 * every distinct key ever requested is retained for the whole session: each
 * debounced search term (`{q:'a'}`, `{q:'ab'}`, …), every filter permutation,
 * every pagination page, every entity-picker lookup. Over a long admin session
 * of filtering + tab-hopping that Map grows without bound → heap growth → GC
 * pressure → the panel gets progressively laggier the longer it's used. Capping
 * it (evicting the least-recently-written keys past a limit) keeps the
 * keep-previous-data UX while stopping the unbounded growth.
 */
function boundedCache(max = 500): Cache {
	const map = new Map<string, unknown>();
	return {
		get: (key) => map.get(key),
		set: (key, value) => {
			map.delete(key); // re-insert to mark most-recently-used
			map.set(key, value);
			if (map.size > max) {
				const oldest = map.keys().next().value;
				if (oldest !== undefined) map.delete(oldest);
			}
		},
		delete: (key) => { map.delete(key); },
		keys: () => map.keys(),
	} as Cache;
}

/**
 * App-wide providers. Two global concerns:
 *
 *   1. `SWRConfig` — wires the global fetcher and sane defaults. The fetcher
 *      accepts string-or-tuple keys (see `swrFetcher` in lib/api.ts). Cache
 *      identity follows the tuple shape, so two queries with different params
 *      live in different slots.
 *
 *   2. `AuthSessionProvider` — single owner of the Supabase auth session
 *      subscription. Per-component `useAuthSession()` reads share the same
 *      subscription instead of each creating one.
 *
 * Previously used `@tanstack/react-query` (`5.100.10` — affected by the
 * upstream supply-chain incident). Migrated to SWR; the existing query-key
 * shape `[path, params?]` is preserved so call sites barely change.
 */
export function Providers({ children }: { children: React.ReactNode }) {
	return (
		<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
			<SWRConfig
				value={{
					fetcher: swrFetcher,
					// `() =>` so SWR's `provider(prevCache)` arg doesn't land on `max`.
					provider: () => boundedCache(),
					dedupingInterval: 60_000,
					revalidateOnFocus: false,
					revalidateOnReconnect: false,
					errorRetryCount: 1,
					keepPreviousData: true,
					// Don't retry auth/client errors — api() already handled the 401
					// refresh+redirect, and retrying a 4xx just spams the server.
					onErrorRetry: (error, _key, _config, revalidate, { retryCount }) => {
						const status = (error as ApiError)?.status;
						if (typeof status === 'number' && status >= 400 && status < 500) return;
						if (retryCount >= 1) return;
						setTimeout(() => revalidate({ retryCount }), 1000);
					},
				}}
			>
				<AuthSessionProvider>{children}</AuthSessionProvider>
				<Toaster position="top-right" />
			</SWRConfig>
		</ThemeProvider>
	);
}
