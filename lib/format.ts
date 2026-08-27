/** Shared read-only display helpers for admin views. */

/** Empty/null → em dash; otherwise the value as a string. */
export const val = (v: unknown): string => (v === null || v === undefined || v === '' ? '—' : String(v));

/** Compact number: 60000000000 → 60.00B, 1666975000 → 1.67B, 124000 → 124,000. */
export const fmtNum = (v: unknown): string => {
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return '—';
	return n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n.toLocaleString();
};
