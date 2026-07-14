'use client';

import { useSearchParams } from 'next/navigation';

/**
 * Initial value for a list page's search box, seeded from the URL `?q=` so the
 * dashboard's "recent data" rows can deep-link straight to a filtered origin
 * (e.g. `/companies?q=Acme`). Safe inside the companies-page tabs — only the
 * active tab's view is mounted, so there's no cross-tab bleed.
 */
export function useInitialQuery(): string {
	const sp = useSearchParams();
	return sp.get('q') ?? '';
}
