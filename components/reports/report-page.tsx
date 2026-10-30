'use client';
// GENERATED — copied from client/components/features/reports/report-page.tsx by scripts/sync-report-renderer.mjs. Edit the client file, then re-run the script.

import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { Moon, SunMedium } from 'lucide-react';
import { resolveTheme, type ReportThemeOverride } from './report-kit/report-theme';
import { useReveal } from './report-kit/use-reveal';
import type { Section } from './report-kit/types';
import { SectionRenderer } from './section-renderer';
import './report-kit/report-kit.css';

/**
 * The report page itself — themed shell, sticky nav, sections — with no data
 * fetching. `ReportView` feeds it the live report; the admin's editor preview
 * feeds it unsaved drafts. The admin copies this file verbatim
 * (admin/scripts/sync-report-renderer.mjs), so it must import nothing app-
 * specific: anything that differs per app (the back control, the empty state)
 * comes in as a prop.
 */
export function ReportPage({ sections, theme, isDark, onToggleDark, back, empty }: {
	sections: Section[];
	theme: ReportThemeOverride | null | undefined;
	isDark: boolean;
	onToggleDark: () => void;
	/** Left of the nav: a link back to the library, or the editor's close button. */
	back?: ReactNode;
	/** Shown when there are no sections. */
	empty?: ReactNode;
}) {
	const t = resolveTheme(isDark, theme);
	const vars = useMemo<CSSProperties>(() => ({
		'--rk-bg': t.bg, '--rk-bg-sec': t.bgSec, '--rk-bg-card': t.bgCard, '--rk-bg-card-hover': t.bgCardHover,
		'--rk-fg': t.text, '--rk-fg-sec': t.textSec, '--rk-fg-muted': t.textMuted,
		'--rk-border': t.border, '--rk-title': t.titleColor, '--rk-nav-bg': t.navBg,
		'--rk-divider': t.divider, '--rk-row-alt': t.tableRowAlt, '--rk-accent': t.accent,
		// ecosystem_map ocean/land + CTA band (depend on dark/light only).
		'--rk-map-ocean-0': isDark ? '#0e1624' : '#e8f0f8',
		'--rk-map-ocean-1': isDark ? '#060d18' : '#d5e4f0',
		'--rk-map-land': isDark ? 'rgba(75,100,130,0.45)' : 'rgba(160,185,210,0.55)',
		'--rk-map-stroke': isDark ? 'rgba(190,208,227,0.18)' : 'rgba(100,130,160,0.25)',
		'--rk-cta-bg': isDark ? '#0c0f1a' : '#2D3B49',
		...(theme?.font_display ? { '--rk-font-display': theme.font_display } : {}),
		...(theme?.font_mono ? { '--rk-font-mono': theme.font_mono } : {}),
	} as CSSProperties), [t, isDark, theme]);

	const anchors = sections.filter((s) => s.title && s.slug).map((s) => ({ slug: s.slug as string, title: s.title as string }));

	return (
		<div className="rk-report" style={vars}>
			<nav className="rk-nav">
				{back}
				<div className="rk-nav__links">
					{anchors.map((a) => (
						<button key={a.slug} type="button" className="rk-nav__link" onClick={() => document.getElementById(a.slug)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>{a.title}</button>
					))}
				</div>
				<button type="button" className="rk-iconbtn rk-iconbtn--bare" aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} title={isDark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={onToggleDark}>{isDark ? <SunMedium size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}</button>
			</nav>

			{sections.length === 0
				? <div className="rk-section">{empty}</div>
				: sections.map((s) => (s.kind === 'hero'
					? <SectionRenderer key={s.id} section={s} />
					: <Reveal key={s.id} sectionId={s.id}><SectionRenderer section={s} /></Reveal>))}
		</div>
	);
}

function Reveal({ children, sectionId }: { children: ReactNode; sectionId: string }) {
	const { ref, shown } = useReveal<HTMLDivElement>();
	return <div ref={ref} data-section-id={sectionId} className={`rk-reveal${shown ? ' is-shown' : ''}`}>{children}</div>;
}
