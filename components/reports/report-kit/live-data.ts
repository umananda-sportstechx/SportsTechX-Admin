'use client';

import useSWR from 'swr';
import { useReveal } from './use-reveal';

/**
 * Lazy-load a live-data section's rows (`GET /api/reports/sections/:id/data`)
 * only once it scrolls near the viewport, then cache hard (these are expensive
 * aggregates). Returns the reveal ref to attach to the section wrapper.
 */
export function useLiveSectionData<T = unknown>(sectionId: string) {
	const { ref, shown } = useReveal<HTMLDivElement>('200px');
	const swr = useSWR<{ data: T }>(shown ? `/api/reports/sections/${sectionId}/data` : null, {
		revalidateOnFocus: false,
		dedupingInterval: 300_000,
	});
	return { ref, data: swr.data?.data, isLoading: shown && swr.isLoading, error: swr.error };
}
