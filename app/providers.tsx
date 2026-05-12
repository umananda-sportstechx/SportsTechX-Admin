'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { AuthSessionProvider } from '@/hooks/use-auth-session';
import { defaultQueryFn } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						queryFn: defaultQueryFn as never,
						staleTime: 60_000,
						refetchOnWindowFocus: false,
						retry: 1,
					},
				},
			}),
	);

	return (
		<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
			<QueryClientProvider client={queryClient}>
				<AuthSessionProvider>{children}</AuthSessionProvider>
				<Toaster position="top-right" />
			</QueryClientProvider>
		</ThemeProvider>
	);
}
