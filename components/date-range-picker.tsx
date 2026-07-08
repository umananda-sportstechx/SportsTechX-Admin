'use client';

import { useEffect, useRef, useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import 'react-day-picker/style.css';

// ISO (YYYY-MM-DD) from/to range. Empty object = all time.
export interface RangeValue { from?: string; to?: string }

const toIso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function fromIso(s?: string): Date | undefined {
	if (!s) return undefined;
	const [y, m, d] = s.split('-').map(Number);
	return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}
const fmt = (s?: string): string => {
	const d = fromIso(s);
	return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
};
const daysAgo = (n: number): Date => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
const startOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date): Date => new Date(d.getFullYear(), d.getMonth() + 1, 0);

const PRESETS: Array<{ label: string; range: () => RangeValue }> = [
	{ label: 'All time', range: () => ({}) },
	{ label: 'Last 7 days', range: () => ({ from: toIso(daysAgo(7)), to: toIso(new Date()) }) },
	{ label: 'Last 30 days', range: () => ({ from: toIso(daysAgo(30)), to: toIso(new Date()) }) },
	{ label: 'Last 90 days', range: () => ({ from: toIso(daysAgo(90)), to: toIso(new Date()) }) },
	{ label: 'This month', range: () => ({ from: toIso(startOfMonth(new Date())), to: toIso(new Date()) }) },
	{ label: 'Last month', range: () => { const lm = new Date(); lm.setMonth(lm.getMonth() - 1); return { from: toIso(startOfMonth(lm)), to: toIso(endOfMonth(lm)) }; } },
	{ label: 'Last 12 months', range: () => ({ from: toIso(daysAgo(365)), to: toIso(new Date()) }) },
];

/** Date-range picker: preset shortcuts apply on click; the calendar only appears once "Custom range" is chosen. */
export function DateRangePicker({ value, onChange }: { value: RangeValue; onChange: (v: RangeValue) => void }) {
	const [open, setOpen] = useState(false);
	const [customOpen, setCustomOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
		document.addEventListener('mousedown', onDown);
		document.addEventListener('keydown', onKey);
		return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
	}, [open]);

	const has = !!(value.from || value.to);
	const label = !has ? 'All time'
		: value.from && value.to ? `${fmt(value.from)} – ${fmt(value.to)}`
			: value.from ? `From ${fmt(value.from)}` : `Until ${fmt(value.to)}`;
	const range: DateRange | undefined = has ? { from: fromIso(value.from), to: fromIso(value.to) } : undefined;
	const activePreset = PRESETS.find((p) => { const r = p.range(); return r.from === value.from && r.to === value.to; })?.label;

	const applyPreset = (r: RangeValue) => { onChange(r); setCustomOpen(false); setOpen(false); };

	return (
		<div ref={ref} style={{ position: 'relative' }}>
			<button className="btn ghost" onClick={() => setOpen((o) => !o)} style={{ minWidth: 160, justifyContent: 'flex-start', gap: 8 }}>
				<CalendarIcon size={14} /> <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
				{has && <X size={13} style={{ opacity: 0.7 }} onClick={(e) => { e.stopPropagation(); onChange({}); }} aria-label="Clear range" />}
			</button>
			{open && (
				<div className="drp-pop" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60, display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 8, borderRight: customOpen ? '1px solid var(--border)' : 'none', minWidth: 156 }}>
						{PRESETS.map((p) => {
							const active = !customOpen && activePreset === p.label;
							return (
								<button key={p.label} className="btn ghost" onClick={() => applyPreset(p.range())}
									style={{ justifyContent: 'flex-start', ...(active ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : {}) }}>
									{p.label}
								</button>
							);
						})}
						<div style={{ height: 1, background: 'var(--border)', margin: '4px 6px' }} />
						<button className="btn ghost" onClick={() => setCustomOpen((v) => !v)}
							style={{ justifyContent: 'flex-start', ...(customOpen ? { background: 'var(--accent-soft)', color: 'var(--accent)' } : {}) }}>
							Custom range…
						</button>
					</div>
					{customOpen && (
						<div style={{ padding: 10 }}>
							<DayPicker
								mode="range"
								numberOfMonths={2}
								defaultMonth={fromIso(value.to) ?? fromIso(value.from)}
								selected={range}
								onSelect={(r) => onChange({ from: r?.from ? toIso(r.from) : undefined, to: r?.to ? toIso(r.to) : undefined })}
							/>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
