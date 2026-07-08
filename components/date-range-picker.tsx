'use client';

import { useEffect, useRef, useState } from 'react';
import { DayPicker, type DateRange } from 'react-day-picker';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import 'react-day-picker/style.css';

// ISO (YYYY-MM-DD) from/to range. Empty object = all time.
export interface RangeValue { from?: string; to?: string }

const PRESETS: Array<{ label: string; days: number | null }> = [
	{ label: 'All time', days: null },
	{ label: 'Last 30 days', days: 30 },
	{ label: 'Last 90 days', days: 90 },
	{ label: 'Last 12 months', days: 365 },
];

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

/** shadcn-style date-range picker: trigger button → popover with preset shortcuts + a two-month range calendar. */
export function DateRangePicker({ value, onChange }: { value: RangeValue; onChange: (v: RangeValue) => void }) {
	const [open, setOpen] = useState(false);
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

	const applyPreset = (days: number | null) => {
		if (days == null) onChange({});
		else { const t = new Date(); const f = new Date(); f.setDate(f.getDate() - days); onChange({ from: toIso(f), to: toIso(t) }); }
		setOpen(false);
	};

	return (
		<div ref={ref} style={{ position: 'relative' }}>
			<button className="btn ghost" onClick={() => setOpen((o) => !o)} style={{ minWidth: 150, justifyContent: 'flex-start', gap: 8 }}>
				<CalendarIcon size={14} /> <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
				{has && (
					<X size={13} style={{ opacity: 0.7 }} onClick={(e) => { e.stopPropagation(); onChange({}); }} aria-label="Clear range" />
				)}
			</button>
			{open && (
				<div className="drp-pop" style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 60, display: 'flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)', overflow: 'hidden' }}>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: 8, borderRight: '1px solid var(--border)', minWidth: 150 }}>
						{PRESETS.map((p) => (
							<button key={p.label} className="btn ghost" style={{ justifyContent: 'flex-start' }} onClick={() => applyPreset(p.days)}>{p.label}</button>
						))}
					</div>
					<div style={{ padding: 10 }}>
						<DayPicker
							mode="range"
							numberOfMonths={2}
							defaultMonth={fromIso(value.to) ?? fromIso(value.from)}
							selected={range}
							onSelect={(r) => onChange({ from: r?.from ? toIso(r.from) : undefined, to: r?.to ? toIso(r.to) : undefined })}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
