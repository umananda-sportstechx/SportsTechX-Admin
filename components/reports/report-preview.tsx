'use client';

import { useMemo, type CSSProperties } from 'react';
import { Empty } from '@/components/atoms';
import { resolveTheme, type ReportThemeOverride } from './report-kit/report-theme';
import { useReveal } from './report-kit/use-reveal';
import type { Section } from './report-kit/types';
import { SectionRenderer } from './section-renderer';
import './report-kit/report-kit.css';

/**
 * Pixel-accurate report preview for the admin. Clones ReportView's theming
 * (the --rk-* CSS vars from resolveTheme) but takes sections + theme as PROPS
 * instead of fetching, so it can render draft/unsaved content. The hosting page
 * supplies its own toolbar (no sticky nav / back / dark-toggle here).
 */
export function ReportPreview({ sections, theme, isDark }: {
	sections: Section[];
	theme: ReportThemeOverride | null;
	isDark: boolean;
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

	return (
		<div className="rk-report" style={vars}>
			{sections.length === 0
				? <div className="rk-section"><Empty msg="No sections yet." /></div>
				: sections.map((s) => (s.kind === 'hero' ? <SectionRenderer key={s.id} section={s} /> : <Reveal key={s.id}><SectionRenderer section={s} /></Reveal>))}
		</div>
	);
}

function Reveal({ children }: { children: React.ReactNode }) {
	const { ref, shown } = useReveal<HTMLDivElement>();
	return <div ref={ref} className={`rk-reveal${shown ? ' is-shown' : ''}`}>{children}</div>;
}
