'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Reveal-on-scroll + lazy-activate, via IntersectionObserver (no gsap/lenis dep).
 * `ref` goes on the element; `shown` flips true once it scrolls into view and
 * stays true (one-way), for fade/translate reveals and to gate lazy data loads.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(rootMargin = '0px 0px -10% 0px') {
	const ref = useRef<T>(null);
	const [shown, setShown] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el || shown) return;
		const io = new IntersectionObserver(
			(entries) => { if (entries.some((e) => e.isIntersecting)) { setShown(true); io.disconnect(); } },
			{ rootMargin },
		);
		io.observe(el);
		return () => io.disconnect();
	}, [shown, rootMargin]);
	return { ref, shown };
}
