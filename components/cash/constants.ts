// Shared Cash-module constants (mirrors the legacy cash tabs).
export const CATEGORIES = [
	'Client Revenue', 'Other Income', 'Payroll & Contractors', 'Software & Subscriptions',
	'Professional & Accounting Fees', 'Taxes & Government Fees', 'Travel & Events',
	'Bank Fees & FX', 'Office & Admin', 'Other / Uncategorized',
] as const;
export const BUSINESS_AREAS = ['Playmakers', 'Advisory', 'Atlas', 'Other'] as const;
export const STATUSES = ['Actual', 'Expected'] as const;
export const PRODUCT_COLORS: Record<string, string> = {
	Playmakers: 'oklch(55% 0.18 250)', Advisory: 'oklch(58% 0.15 150)', Atlas: 'oklch(53% 0.20 300)', Other: 'oklch(70% 0.02 250)',
};

// EUR with negatives in parentheses (dashboard style).
export const EUR = (n: number): string => {
	const v = Math.round(n || 0);
	return v < 0 ? `(€${Math.abs(v).toLocaleString('de-DE')})` : `€${v.toLocaleString('de-DE')}`;
};
export const fmtDate = (s: string | null): string => {
	if (!s) return '—';
	const d = new Date(`${s.slice(0, 10)}T00:00:00`);
	return isNaN(d.getTime()) ? (s ?? '—') : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
