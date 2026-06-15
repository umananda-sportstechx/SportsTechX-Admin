'use client';

import useSWR from 'swr';
import { qk } from '@/lib/query-keys';

/**
 * Lightweight filter primitives for admin list pages. `FilterBar` is the row
 * container (reuses the existing `.filter-bar` style); `FilterSelect` is a
 * labelled dropdown that always offers an "all" option (empty value).
 *
 * Keep filter state in the page via useState and pass value/onChange — the
 * page is responsible for threading the values into its SWR list key.
 */

export function FilterBar({ children }: { children: React.ReactNode }) {
	return (
		<div className="filter-bar" style={{ marginBottom: 'var(--space-4)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
			{children}
		</div>
	);
}

export interface FilterOption { value: string; label: string }

export function FilterSelect({
	value, onChange, options, allLabel = 'All', ariaLabel,
}: {
	value: string;
	onChange: (v: string) => void;
	options: Array<FilterOption | string>;
	allLabel?: string;
	ariaLabel?: string;
}) {
	return (
		<select
			className="search-input"
			aria-label={ariaLabel}
			style={{ height: 32, flex: '0 0 auto', minWidth: 130 }}
			value={value}
			onChange={(e) => onChange(e.target.value)}
		>
			<option value="">{allLabel}</option>
			{options.map((o) => {
				const v = typeof o === 'string' ? o : o.value;
				const l = typeof o === 'string' ? o.replace(/_/g, ' ') : o.label;
				return <option key={v} value={v}>{l}</option>;
			})}
		</select>
	);
}

/** Tri-state boolean filter: All / Yes / No. Value is '' | 'true' | 'false'. */
export function BoolFilter({
	value, onChange, ariaLabel, yesLabel = 'Yes', noLabel = 'No', allLabel = 'Any',
}: { value: string; onChange: (v: string) => void; ariaLabel?: string; yesLabel?: string; noLabel?: string; allLabel?: string }) {
	return <FilterSelect ariaLabel={ariaLabel} value={value} onChange={onChange} options={[{ value: 'true', label: yesLabel }, { value: 'false', label: noLabel }]} allLabel={allLabel} />;
}

/** Compact min–max numeric range (two inputs). Values are kept as strings. */
export function FilterRange({
	label, min, max, onMin, onMax, width = 78,
}: { label: string; min: string; max: string; onMin: (v: string) => void; onMax: (v: string) => void; width?: number }) {
	return (
		<span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--fg-muted)' }}>
			{label}
			<input className="search-input" style={{ height: 32, width }} type="number" placeholder="min" value={min} onChange={(e) => onMin(e.target.value)} aria-label={`${label} min`} />
			<span>–</span>
			<input className="search-input" style={{ height: 32, width }} type="number" placeholder="max" value={max} onChange={(e) => onMax(e.target.value)} aria-label={`${label} max`} />
		</span>
	);
}

interface RefRow { id: string; name: string; slug: string }
const REF_KEY = {
	sectors: qk.reference.sectors, sports: qk.reference.sports,
	'tech-tags': qk.reference.techTags, 'round-types': qk.reference.roundTypes,
} as const;

/** Single-select filter populated from a reference taxonomy; emits the slug. */
export function RefSlugFilter({
	kind, value, onChange, allLabel, ariaLabel,
}: { kind: keyof typeof REF_KEY; value: string; onChange: (v: string) => void; allLabel: string; ariaLabel?: string }) {
	const { data } = useSWR<RefRow[]>(REF_KEY[kind](), { dedupingInterval: 60 * 60_000 });
	return <FilterSelect ariaLabel={ariaLabel} value={value} onChange={onChange} options={(data ?? []).map((r) => ({ value: r.slug, label: r.name }))} allLabel={allLabel} />;
}

/** A reusable strip of KPI StatCards using the admin grid. */
export function StatStrip({ children, cols }: { children: React.ReactNode; cols?: number }) {
	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: `repeat(${cols ?? 4}, minmax(0, 1fr))`,
				gap: 'var(--space-3)',
				marginBottom: 'var(--space-4)',
			}}
		>
			{children}
		</div>
	);
}
