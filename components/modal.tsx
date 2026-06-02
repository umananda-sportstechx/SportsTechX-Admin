'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Shared modal dialog. Fixes the previous per-page inline overlays whose
 * `display:grid; place-items:center` trapped overflow (tall modals couldn't be
 * scrolled vertically). Here the overlay itself scrolls AND the body scrolls
 * internally, so a modal taller than the viewport is always fully reachable.
 *
 * - Click the backdrop or press Esc to close.
 * - Locks body scroll while open.
 * - Header is fixed; `children` render in a scrollable body. Put the action
 *   buttons last inside `children` (or pass `footer` for a pinned footer).
 */
export function Modal({
	title,
	onClose,
	width = 560,
	children,
	footer,
}: {
	title: string;
	onClose: () => void;
	width?: number;
	children: React.ReactNode;
	footer?: React.ReactNode;
}) {
	useEffect(() => {
		const prevOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
		window.addEventListener('keydown', onKey);
		return () => {
			document.body.style.overflow = prevOverflow;
			window.removeEventListener('keydown', onKey);
		};
	}, [onClose]);

	return (
		<div className="modal-overlay" onClick={onClose}>
			<div className="modal-card card" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
				<div className="modal-head">
					<div className="modal-title">{title}</div>
					<button className="btn ghost" onClick={onClose} aria-label="Close"><X size={14} /></button>
				</div>
				<div className="modal-body">{children}</div>
				{footer && <div className="modal-foot">{footer}</div>}
			</div>
		</div>
	);
}
