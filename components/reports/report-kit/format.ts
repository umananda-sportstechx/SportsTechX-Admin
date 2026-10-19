/** Compact number (1.2K / 3.4M / 5.6B) for report figures. */
export function formatBig(n: number): string {
	if (!Number.isFinite(n)) return '—';
	if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
	if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
	if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
	return n.toFixed(0);
}

export function formatDate(iso: string | null | undefined): string {
	if (!iso) return '—';
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}
