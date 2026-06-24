'use client';

import { useEffect, useState } from 'react';

/**
 * Debounce a rapidly-changing value (e.g. a search box). Bind the input to the
 * raw state for snappy typing, but feed the DEBOUNCED value into SWR keys / fetch
 * params so we fire one request after typing settles — not one per keystroke
 * (which trips the API rate limit).
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(t);
	}, [value, delayMs]);
	return debounced;
}
