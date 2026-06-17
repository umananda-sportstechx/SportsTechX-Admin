'use client';

import useSWR from 'swr';
import { Receipt, RefreshCw } from 'lucide-react';

/**
 * AI usage & cost ledger.
 *
 * Reads two admin endpoints:
 *   GET /api/admin/ai-usage/summary  → { totals, byFeature, byDay }
 *   GET /api/admin/ai-usage/recent   → recent ledger rows
 *
 * Every Anthropic + Voyage call writes a ledger row (see AiUsageService.record).
 * `credited` = the user's credits were charged; uncredited spend is company-borne
 * (admin/background jobs, embeddings, report generation).
 */

interface Totals {
	total_usd: string;
	calls: string;
	credited_usd: string;
	uncredited_usd: string;
	credits_charged: string;
}
interface FeatureRow {
	feature: string;
	provider: string;
	calls: number;
	usd: string;
	tokens: string;
}
interface DayRow { day: string; usd: string }
interface Summary { totals: Totals; byFeature: FeatureRow[]; byDay: DayRow[] }

interface LedgerRow {
	id: string;
	feature: string;
	provider: string;
	model: string;
	input_tokens: number;
	output_tokens: number;
	cache_read_tokens: number;
	cache_write_tokens: number;
	usd_cost: string;
	profile_id: string | null;
	credited: boolean;
	credits_charged: number;
	ref_entity_type: string | null;
	ref_entity_id: string | null;
	created_at: string;
}

const usd = (v: string | number | undefined) =>
	`$${Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
const num = (v: string | number | undefined) => Number(v ?? 0).toLocaleString();

export default function AiUsagePage() {
	const { data: summary, mutate: mutateSummary, isLoading } = useSWR<Summary>(
		['/api/admin/ai-usage/summary'],
		{ dedupingInterval: 30_000 },
	);
	const { data: recent, mutate: mutateRecent } = useSWR<LedgerRow[]>(
		['/api/admin/ai-usage/recent', { limit: 100 }],
		{ dedupingInterval: 30_000 },
	);

	const t = summary?.totals;
	const refresh = () => { void mutateSummary(); void mutateRecent(); };

	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
				<div>
					<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
						<Receipt size={11} style={{ verticalAlign: '-1px' }} /> AI usage · last 30 days
					</div>
					<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>
						AI usage & cost ledger
					</h1>
					<p style={{ fontSize: 14, color: 'var(--fg-2)', maxWidth: 720, margin: '6px 0 0' }}>
						Token spend across every Anthropic + Voyage call. <b>Credited</b> = charged to the
						user&apos;s credits; <b>uncredited</b> = company-borne (embeddings, report generation,
						background jobs). Pricing is editable in <code style={{ background: 'var(--bg-2)', padding: '0 4px' }}>ai_model_pricing</code>.
					</p>
				</div>
				<button className="btn ghost" onClick={refresh}><RefreshCw size={12} /> Refresh</button>
			</div>

			{/* Stat cards */}
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
				<StatCard label="Total spend" value={usd(t?.total_usd)} loading={isLoading} />
				<StatCard label="Credited (user-paid)" value={usd(t?.credited_usd)} loading={isLoading} />
				<StatCard label="Uncredited (company)" value={usd(t?.uncredited_usd)} accent loading={isLoading} />
				<StatCard label="AI calls" value={num(t?.calls)} loading={isLoading} />
				<StatCard label="Credits charged" value={num(t?.credits_charged)} loading={isLoading} />
			</div>

			{/* By feature */}
			<div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
				<div style={{ fontWeight: 700, marginBottom: 10 }}>Spend by feature</div>
				<table className="data-table">
					<thead><tr><th>Feature</th><th>Provider</th><th>Calls</th><th>Tokens</th><th>Cost</th></tr></thead>
					<tbody>
						{(summary?.byFeature ?? []).map((r) => (
							<tr key={`${r.feature}:${r.provider}`}>
								<td>{r.feature}</td>
								<td style={{ color: 'var(--fg-muted)' }}>{r.provider}</td>
								<td className="num">{num(r.calls)}</td>
								<td className="num">{num(r.tokens)}</td>
								<td className="num">{usd(r.usd)}</td>
							</tr>
						))}
						{(summary?.byFeature?.length ?? 0) === 0 && (
							<tr><td colSpan={5} style={{ color: 'var(--fg-muted)' }}>No AI usage recorded yet.</td></tr>
						)}
					</tbody>
				</table>
			</div>

			{/* Recent rows */}
			<div className="card" style={{ padding: 'var(--space-4)' }}>
				<div style={{ fontWeight: 700, marginBottom: 10 }}>Recent calls <span style={{ fontWeight: 400, color: 'var(--fg-muted)', fontSize: 12 }}>· latest 100</span></div>
				<div style={{ overflowX: 'auto' }}>
					<table className="data-table">
						<thead>
							<tr>
								<th>When</th><th>Feature</th><th>Model</th><th>In</th><th>Out</th>
								<th>Cost</th><th>Credited</th><th>User</th>
							</tr>
						</thead>
						<tbody>
							{(recent ?? []).map((r) => (
								<tr key={r.id}>
									<td style={{ whiteSpace: 'nowrap', color: 'var(--fg-muted)', fontSize: 12 }}>
										{new Date(r.created_at).toLocaleString()}
									</td>
									<td>{r.feature}</td>
									<td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.model}</td>
									<td className="num">{num(r.input_tokens)}</td>
									<td className="num">{num(r.output_tokens)}</td>
									<td className="num">{usd(r.usd_cost)}</td>
									<td>
										{r.credited
											? <span className="chip on">{r.credits_charged} cr</span>
											: <span style={{ color: 'var(--fg-muted)' }}>—</span>}
									</td>
									<td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
										{r.profile_id ? r.profile_id.slice(0, 8) : 'system'}
									</td>
								</tr>
							))}
							{(recent?.length ?? 0) === 0 && (
								<tr><td colSpan={8} style={{ color: 'var(--fg-muted)' }}>No calls yet.</td></tr>
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}

function StatCard({ label, value, accent, loading }: { label: string; value: string; accent?: boolean; loading?: boolean }) {
	return (
		<div className="card" style={{ padding: 'var(--space-4)' }}>
			<div className="co-stat-label">{label}</div>
			<div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.01em', color: accent ? 'var(--accent)' : undefined }}>
				{loading ? '…' : value}
			</div>
		</div>
	);
}
