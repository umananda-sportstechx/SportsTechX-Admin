'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Receipt, RefreshCw, Save, Plus } from 'lucide-react';
import { api } from '@/lib/api';
import { StatsPanel } from '@/components/atoms';

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
	profile_name: string | null;
	profile_email: string | null;
	profile_tier: string | null;
	profile_is_admin: boolean | null;
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
	const router = useRouter();
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
						background jobs). Edit model pricing and the credit conversion rate below.
					</p>
				</div>
				<button className="btn ghost" onClick={refresh}><RefreshCw size={12} /> Refresh</button>
			</div>

			{/* Stat cards */}
			<StatsPanel>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 'var(--space-3)' }}>
					<StatCard label="Total spend" value={usd(t?.total_usd)} loading={isLoading} />
					<StatCard label="Credited (user-paid)" value={usd(t?.credited_usd)} loading={isLoading} />
					<StatCard label="Uncredited (company)" value={usd(t?.uncredited_usd)} accent loading={isLoading} />
					<StatCard label="AI calls" value={num(t?.calls)} loading={isLoading} />
					<StatCard label="Credits charged" value={num(t?.credits_charged)} loading={isLoading} />
				</div>
			</StatsPanel>

			{/* Cost configuration */}
			<PricingConfig />

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
									<td>
										<UserCell row={r} router={router} />
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

/**
 * User column: name + a badge (Admin, or plan tier — a "free" tier spending
 * credits is using top-up/granted credits). Clicking opens the user in the
 * admin Users page (filtered + expanded).
 */
function UserCell({ row, router }: { row: LedgerRow; router: ReturnType<typeof useRouter> }) {
	if (!row.profile_id) return <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>system</span>;

	const name = row.profile_name || row.profile_email || `${row.profile_id.slice(0, 8)}…`;
	const isAdmin = !!row.profile_is_admin;
	const tier = (row.profile_tier ?? 'free').toLowerCase();
	const badge = isAdmin ? 'Admin' : tier === 'free' ? 'Free · top-up/granted' : tier;
	const badgeColor = isAdmin ? 'var(--accent)' : tier === 'free' ? 'var(--fg-muted)' : 'var(--fg-2)';

	const open = () => {
		const params = new URLSearchParams();
		params.set('q', row.profile_email ?? row.profile_id!);
		params.set('focus', row.profile_id!);
		router.push(`/users?${params.toString()}`);
	};

	return (
		<button
			onClick={open}
			title="Open in Users"
			style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left', maxWidth: 200 }}
		>
			<div style={{ fontSize: 12, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
			<div style={{ fontSize: 10, color: badgeColor, textTransform: 'capitalize' }}>{badge}</div>
		</button>
	);
}

// ─── Cost configuration: model pricing ($/MTok) + credit conversion rate ──────

interface PricingModel {
	id: string;
	provider: string;
	model: string;
	input_usd_per_mtok: string;
	output_usd_per_mtok: string;
	cache_read_usd_per_mtok: string;
	cache_write_usd_per_mtok: string;
	is_active: boolean;
}
interface PricingConfigResp { models: PricingModel[]; usd_per_credit: number }

const BLANK_MODEL: PricingModel = {
	id: '', provider: 'anthropic', model: '',
	input_usd_per_mtok: '0', output_usd_per_mtok: '0',
	cache_read_usd_per_mtok: '0', cache_write_usd_per_mtok: '0', is_active: true,
};

function PricingConfig() {
	const { data, mutate, isLoading } = useSWR<PricingConfigResp>(['/api/admin/ai-usage/pricing'], { dedupingInterval: 30_000 });
	const [rate, setRate] = useState('');
	const [savingRate, setSavingRate] = useState(false);
	const [adding, setAdding] = useState(false);

	const effectiveRate = rate !== '' ? rate : String(data?.usd_per_credit ?? '');

	const saveRate = async () => {
		const v = Number(effectiveRate);
		if (!Number.isFinite(v) || v <= 0) { toast.error('Enter a positive USD-per-credit value'); return; }
		setSavingRate(true);
		try { await api('PATCH', '/api/admin/ai-usage/credit-rate', { usd_per_credit: v }); toast.success('Credit rate saved'); setRate(''); void mutate(); }
		catch (e) { toast.error((e as Error).message); }
		finally { setSavingRate(false); }
	};

	return (
		<div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
				<div style={{ fontWeight: 700 }}>Cost configuration</div>
				<button className="btn ghost" onClick={() => setAdding((a) => !a)}><Plus size={12} /> Add model</button>
			</div>

			{/* Credit conversion rate — the margin lever */}
			<div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
				<span style={{ fontSize: 13, color: 'var(--fg-2)' }}>USD per credit</span>
				<input
					className="search-input" style={{ width: 120, height: 30 }} type="number" step="0.0001" min="0"
					value={effectiveRate} onChange={(e) => setRate(e.target.value)} disabled={isLoading}
				/>
				<button className="btn" disabled={savingRate} onClick={() => void saveRate()}><Save size={12} /> Save rate</button>
				<span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
					Lower rate = more credits charged per $ of tokens (higher margin). Applies to new calls within ~minutes.
				</span>
			</div>

			<div style={{ overflowX: 'auto' }}>
				<table className="data-table">
					<thead>
						<tr>
							<th>Provider</th><th>Model</th>
							<th>Input $/M</th><th>Output $/M</th><th>Cache-read $/M</th><th>Cache-write $/M</th>
							<th>Active</th><th></th>
						</tr>
					</thead>
					<tbody>
						{adding && <ModelRow key="__new" initial={BLANK_MODEL} isNew onSaved={() => { setAdding(false); void mutate(); }} />}
						{(data?.models ?? []).map((m) => <ModelRow key={m.id} initial={m} onSaved={() => void mutate()} />)}
						{!isLoading && (data?.models?.length ?? 0) === 0 && !adding && (
							<tr><td colSpan={8} style={{ color: 'var(--fg-muted)' }}>No models priced yet.</td></tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function ModelRow({ initial, isNew, onSaved }: { initial: PricingModel; isNew?: boolean; onSaved: () => void }) {
	const [m, setM] = useState<PricingModel>(initial);
	const [saving, setSaving] = useState(false);
	const set = (k: keyof PricingModel, v: string | boolean) => setM((p) => ({ ...p, [k]: v }));
	const numInput = (k: keyof PricingModel) => (
		<input
			className="search-input" style={{ width: 90, height: 28 }} type="number" step="0.01" min="0"
			value={m[k] as string} onChange={(e) => set(k, e.target.value)}
		/>
	);
	const save = async () => {
		if (!m.model.trim() || !m.provider.trim()) { toast.error('Provider and model are required'); return; }
		setSaving(true);
		try {
			await api('PATCH', '/api/admin/ai-usage/pricing/model', {
				provider: m.provider.trim(), model: m.model.trim(),
				input_usd_per_mtok: Number(m.input_usd_per_mtok), output_usd_per_mtok: Number(m.output_usd_per_mtok),
				cache_read_usd_per_mtok: Number(m.cache_read_usd_per_mtok), cache_write_usd_per_mtok: Number(m.cache_write_usd_per_mtok),
				is_active: m.is_active,
			});
			toast.success(isNew ? 'Model added' : 'Pricing saved');
			onSaved();
		} catch (e) { toast.error((e as Error).message); }
		finally { setSaving(false); }
	};
	return (
		<tr>
			<td>{isNew ? <input className="search-input" style={{ width: 100, height: 28 }} value={m.provider} onChange={(e) => set('provider', e.target.value)} /> : m.provider}</td>
			<td>{isNew ? <input className="search-input" style={{ width: 160, height: 28 }} placeholder="model id" value={m.model} onChange={(e) => set('model', e.target.value)} /> : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{m.model}</span>}</td>
			<td>{numInput('input_usd_per_mtok')}</td>
			<td>{numInput('output_usd_per_mtok')}</td>
			<td>{numInput('cache_read_usd_per_mtok')}</td>
			<td>{numInput('cache_write_usd_per_mtok')}</td>
			<td><input type="checkbox" checked={m.is_active} onChange={(e) => set('is_active', e.target.checked)} /></td>
			<td><button className="btn" disabled={saving} onClick={() => void save()}><Save size={11} /> Save</button></td>
		</tr>
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
