'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, X } from 'lucide-react';
import { ReportPage } from './report-page';
import type { ReportThemeOverride } from './report-kit/report-theme';
import type { Section } from './report-kit/types';

/**
 * Full-screen preview from the editor: the real report page (ReportPage is the
 * client's component, copied verbatim) over the whole viewport, so type and
 * layout — which scale with the viewport — match what users see. It renders the
 * saved sections with the open section's unsaved edits merged in, and opens
 * scrolled to the section being edited.
 */
export function PreviewOverlay({ sections, theme, focusSectionId, tierPreviewHref, warning, onClose }: {
	sections: Section[];
	theme: ReportThemeOverride | null;
	focusSectionId: string | null;
	tierPreviewHref: string;
	/** Shown in the admin bar (e.g. "this report renders from a custom page"). */
	warning?: string;
	onClose: () => void;
}) {
	const [isDark, setIsDark] = useState(theme?.default_dark ?? true);
	const [publishedOnly, setPublishedOnly] = useState(false);
	const scroller = useRef<HTMLDivElement>(null);
	const isPublished = (s: Section) => 'is_published' in s && s.is_published;
	const shown = publishedOnly ? sections.filter(isPublished) : sections;
	const drafts = sections.length - sections.filter(isPublished).length;

	useEffect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
		window.addEventListener('keydown', onKey);
		return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
	}, [onClose]);

	// Land on the section being edited (the hero is the top of the page anyway).
	// Live-data charts above it fill in after the first paint and push it down,
	// so keep re-aiming while the page settles — until the admin scrolls.
	useEffect(() => {
		const sc = scroller.current;
		if (!focusSectionId || !sc) return;
		let userMoved = false;
		const stop = () => { userMoved = true; };
		const aim = () => {
			if (userMoved) return;
			const el = sc.querySelector<HTMLElement>(`[data-section-id="${focusSectionId}"]`);
			if (el) sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 64;
		};
		sc.addEventListener('wheel', stop, { passive: true });
		sc.addEventListener('touchstart', stop, { passive: true });
		sc.addEventListener('keydown', stop);
		const raf = requestAnimationFrame(aim);
		const timers = [250, 700, 1500].map((ms) => setTimeout(aim, ms));
		return () => {
			cancelAnimationFrame(raf); timers.forEach(clearTimeout);
			sc.removeEventListener('wheel', stop); sc.removeEventListener('touchstart', stop); sc.removeEventListener('keydown', stop);
		};
	}, [focusSectionId]);

	return (
		<div ref={scroller} role="dialog" aria-modal="true" aria-label="Report preview" style={{ position: 'fixed', inset: 0, zIndex: 200, overflowY: 'auto', overflowX: 'hidden', background: '#000' }}>
			<ReportPage
				sections={shown}
				theme={theme}
				isDark={isDark}
				onToggleDark={() => setIsDark((d) => !d)}
				back={<button type="button" className="rk-iconbtn" aria-label="Back to editor" title="Back to editor (Esc)" onClick={onClose}><ArrowLeft size={16} /></button>}
				empty={<p style={{ color: 'var(--rk-fg-muted)', textAlign: 'center' }}>{publishedOnly ? 'No sections are published yet — users would see an empty report.' : 'No sections yet.'}</p>}
			/>

			<div className="preview-bar">
				<span className="preview-bar__label">Preview{publishedOnly ? ' · as users see it' : drafts ? ` · incl. ${drafts} draft${drafts === 1 ? '' : 's'}` : ''} · unsaved edits shown</span>
				{warning && <span className="preview-bar__warn">{warning}</span>}
				<label className="preview-bar__toggle">
					<input type="checkbox" checked={publishedOnly} onChange={(e) => setPublishedOnly(e.target.checked)} /> Published only
				</label>
				<Link href={tierPreviewHref} className="preview-bar__btn" title="Saved version, per tier and device width">Tier &amp; device <ExternalLink size={11} /></Link>
				<button type="button" className="preview-bar__btn preview-bar__btn--primary" onClick={onClose}><X size={12} /> Close</button>
			</div>
		</div>
	);
}
