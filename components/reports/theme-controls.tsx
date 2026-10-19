'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { X, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import type { ReportThemeOverride } from '@/components/reports/report-kit/report-theme';

/**
 * Per-report theme editor. Edits `reports.theme` (the jsonb the section
 * renderers read as --rk-* CSS vars). `onChange` fires on every keystroke so
 * the live preview re-themes instantly; "Save" persists via
 * PATCH /api/admin/reports/:id. A null theme = the default GSTER-pink palette.
 *
 * Colours are plain CSS strings; the native colour picker handles hex, and a
 * text field is kept alongside for rgb()/hsl()/named values the picker can't show.
 */
export function ThemeControls({
	reportId, value, onChange, onClose,
}: {
	reportId: string;
	value: ReportThemeOverride | null;
	onChange: (theme: ReportThemeOverride | null) => void;
	onClose: () => void;
}) {
	const t = value ?? {};
	const [saving, setSaving] = useState(false);

	const set = (patch: Partial<ReportThemeOverride>) => {
		const next = { ...t, ...patch };
		// Drop empty strings so we store a tidy object (and fall back to defaults).
		for (const k of Object.keys(next) as (keyof ReportThemeOverride)[]) {
			if (next[k] === '' || next[k] === undefined) delete next[k];
		}
		onChange(Object.keys(next).length ? next : null);
	};

	const save = async () => {
		setSaving(true);
		try {
			await api('PATCH', `/api/admin/reports/${reportId}`, { theme: value });
			toast.success('Theme saved');
			onClose();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setSaving(false);
		}
	};

	const reset = () => onChange(null);

	return (
		<div style={{ display: 'grid', gap: 14 }}>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<div style={{ fontWeight: 700, flex: 1 }}>Report theme</div>
				<button className="btn ghost" onClick={onClose} aria-label="Close"><X size={14} /></button>
			</div>
			<p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
				Controls the report&rsquo;s own look (independent of the admin light/dark). Leave blank for the default palette.
			</p>

			<ColorRow label="Accent" hint="Primary brand colour (titles, bars, CTAs)" value={t.accent ?? ''} fallback="#ED1A5E" onChange={(v) => set({ accent: v })} />
			<ColorRow label="Accent 2" hint="Secondary accent (gradients, highlights)" value={t.accent_2 ?? ''} fallback="#ff6b9d" onChange={(v) => set({ accent_2: v })} />

			<label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
				<input type="checkbox" checked={t.default_dark ?? true} onChange={(e) => set({ default_dark: e.target.checked })} />
				Open in dark mode by default
			</label>

			<FontRow label="Display font" placeholder="e.g. 'Bebas Neue', sans-serif" value={t.font_display ?? ''} onChange={(v) => set({ font_display: v })} />
			<FontRow label="Mono font" placeholder="e.g. 'DM Mono', monospace" value={t.font_mono ?? ''} onChange={(v) => set({ font_mono: v })} />

			<div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
				<button className="btn ghost" onClick={reset} title="Clear overrides"><RotateCcw size={12} /> Reset</button>
				<div style={{ flex: 1 }} />
				<button className="btn" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save theme'}</button>
			</div>
		</div>
	);
}

function ColorRow({ label, hint, value, fallback, onChange }: { label: string; hint: string; value: string; fallback: string; onChange: (v: string) => void }) {
	// The native picker needs a hex; show the stored value verbatim in the text field.
	const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
	return (
		<div style={{ display: 'grid', gap: 4 }}>
			<div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<input type="color" value={hex} onChange={(e) => onChange(e.target.value)} style={{ width: 34, height: 30, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'none', cursor: 'pointer' }} />
				<input className="search-input" style={{ flex: 1 }} placeholder={fallback} value={value} onChange={(e) => onChange(e.target.value)} />
			</div>
			<div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>{hint}</div>
		</div>
	);
}

function FontRow({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
	return (
		<div style={{ display: 'grid', gap: 4 }}>
			<div style={{ fontSize: 12, fontWeight: 600 }}>{label}</div>
			<input className="search-input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
		</div>
	);
}
