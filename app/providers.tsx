'use client';

import { SWRConfig } from 'swr';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { AuthSessionProvider } from '@/hooks/use-auth-session';
import { swrFetcher } from '@/lib/api';

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
					dedupingInterval: 60_000,
					revalidateOnFocus: false,
					revalidateOnReconnect: false,
					errorRetryCount: 1,
					keepPreviousData: true,
				}}
			>
				<AuthSessionProvider>{children}</AuthSessionProvider>
				<Toaster position="top-right" />
			</SWRConfig>
		</ThemeProvider>
	);
}
