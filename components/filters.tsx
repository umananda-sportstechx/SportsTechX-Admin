'use client';

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
