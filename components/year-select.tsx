'use client';

import { Select } from '@/components/select';

/**
 * Year dropdown for "founded" / "year launched" / cohort-year fields. These are
 * a single calendar year (not a full date), so a constrained dropdown beats a
 * free-number input — no typos, no out-of-range values. Value is the year as a
 * string (matching the form-state convention) or '' for none.
 */
export function YearSelect({
	value, onChange, min = 1900, placeholder = '— year —',
}: {
	value: string;
	onChange: (v: string) => void;
	min?: number;
	placeholder?: string;
}) {
	const max = new Date().getFullYear() + 1; // allow next year (e.g. upcoming cohorts)
	const years: number[] = [];
	for (let y = max; y >= min; y--) years.push(y);
	return (
		<Select value={value} onChange={onChange} searchable width="100%" style={{ display: 'block', width: '100%' }} placeholder={placeholder} options={[{ value: '', label: placeholder }, ...years.map((y) => ({ value: String(y), label: String(y) }))]} />
	);
}
