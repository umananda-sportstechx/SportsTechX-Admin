import { useEffect } from 'react';

/**
 * While `dirty`, ask before leaving the page: on unload/reload, and on any
 * in-app link click (capture phase, so it runs before Next's <Link> navigates).
 * In-page anchors (same path) are let through.
 */
export function useLeaveGuard(dirty: boolean, message = 'You have unsaved changes. Leave and discard them?') {
	useEffect(() => {
		if (!dirty) return;
		const unload = (e: BeforeUnloadEvent) => { e.preventDefault(); };
		const click = (e: MouseEvent) => {
			const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
			if (!a || a.target === '_blank' || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
			const url = new URL(a.href, location.href);
			if (!/^https?:$/.test(url.protocol)) return;                 // mailto:, tel: … don't leave the page
			if (url.origin === location.origin && url.pathname === location.pathname) return;
			if (!window.confirm(message)) { e.preventDefault(); e.stopPropagation(); }
		};
		window.addEventListener('beforeunload', unload);
		document.addEventListener('click', click, true);
		return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true); };
	}, [dirty, message]);
}
