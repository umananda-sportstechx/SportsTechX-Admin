'use client';

import { useState } from 'react';

/**
 * Minimal hover/focus tooltip for icon-only controls. Wrap the trigger:
 *   <Tooltip label="Delete"><button>…</button></Tooltip>
 * Themed with admin tokens; appears on hover and keyboard focus.
 */
export function Tooltip({ label, children, side = 'top' }: { label: string; children: React.ReactNode; side?: 'top' | 'bottom' }) {
	const [show, setShow] = useState(false);
	const pos: React.CSSProperties = side === 'bottom'
		? { top: 'calc(100% + 6px)' }
		: { bottom: 'calc(100% + 6px)' };
	return (
		<span
			style={{ position: 'relative', display: 'inline-flex' }}
			onMouseEnter={() => setShow(true)}
			onMouseLeave={() => setShow(false)}
			onFocusCapture={() => setShow(true)}
			onBlurCapture={() => setShow(false)}
		>
			{children}
			{show && (
				<span
					role="tooltip"
					style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', zIndex: 80, background: 'var(--fg)', color: 'var(--bg)', fontSize: 11, fontWeight: 500, letterSpacing: '0.01em', padding: '4px 8px', borderRadius: 6, whiteSpace: 'nowrap', pointerEvents: 'none', boxShadow: 'var(--shadow-md)', ...pos }}
				>
					{label}
				</span>
			)}
		</span>
	);
}
