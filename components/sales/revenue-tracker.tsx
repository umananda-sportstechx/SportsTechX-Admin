'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { RefreshCw, TrendingUp, ChevronRight, ExternalLink, Clock, Mail, CreditCard, AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { Select } from '@/components/select';
import { PieDonut, PieLegend, type PieSegment } from '@/components/charts';

/**
 * Revenue Tracker (Sales ▸ Sales Tracker) — port of the STX-WebApp
 * /admin/revenue-tracker page: a left "Data Input" sidebar (period filter,
 * per-product realized + editable targets, revenue by audience) beside the
 * main pane (headline cards, overall + per-product progress, per-product sales
 * tracker, revenue mix, pipeline).
 */

interface Product { id: string; name: string; slug: string; sort_order: number }
interface Target {
	id: string; year: number; product_id: string | null; scope: 'product' | 'company_min' | 'company_full';
	annual_target_eur: number | null; annual_units_target: number | null; annual_touchpoints_target: number | null; touchpoints_ytd: number | null;
}
interface Deal {
	id: string; product_id: string | null; prospect_name: string | null; stage: string | null;
	deal_value_net_eur: number; expected_revenue_eur: number; is_won: boolean; is_lost: boolean;
	attio_company_id: string | null; touchpoint_count: number;
}
interface TrackerData {
	products: Product[];
	realizedByProductId: Record<string, number>;
	unitsSoldByProductId: Record<string, number>;
	realizedByAudience: Record<string, number>;
	totalRealized: number;
	targets: Target[];
	touchpointsBySlug: Record<string, number>;
	pipeline: { deals: Deal[]; globalWonCount: number; globalOpenWeighted: number };
	lastPipelineSync: string | null;
}

const fmtEur = (n: number) => '€' + Math.round(n || 0).toLocaleString('de-DE');
const fmtEurShort = (n: number) => n >= 1_000_000 ? '€' + (n / 1_000_000).toFixed(1) + 'M' : n >= 1_000 ? '€' + Math.round(n / 1_000) + 'k' : '€' + Math.round(n || 0);

const AUDIENCE = [
	{ value: 'startups', label: 'Startups', color: 'oklch(56% 0.20 18)' },
	{ value: 'investors', label: 'Investors', color: 'oklch(45% 0.05 250)' },
	{ value: 'others', label: 'Others', color: 'oklch(70% 0.02 250)' },
];
const PRODUCT_COLORS: Record<string, string> = {
	playmakers: 'oklch(58% 0.15 150)', sponsorship_reports: 'oklch(58% 0.16 250)',
	dealflow_advisory: 'oklch(65% 0.15 65)', intelligence_hub_plans: 'oklch(55% 0.20 300)',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getYearElapsed(): number {
	const now = new Date();
	const start = new Date(now.getFullYear(), 0, 1).getTime();
	const end = new Date(now.getFullYear() + 1, 0, 1).getTime();
	return (now.getTime() - start) / (end - start);
}
function status(realizedPct: number, elapsedPct: number): 'On Track' | 'Close' | 'Behind' {
	if (realizedPct >= elapsedPct) return 'On Track';
	if (elapsedPct - realizedPct <= 15) return 'Close';
	return 'Behind';
}
const statusColor = (s: string) => s === 'On Track' ? 'var(--pos)' : s === 'Close' ? 'var(--warn)' : 'var(--neg)';

export function RevenueTracker() {
	const todayYear = new Date().getFullYear();
	const [year, setYear] = useState(todayYear);
	const [month, setMonth] = useState(0);

	const { data, isLoading, mutate } = useSWR<TrackerData>(
		['/api/admin/revenue-tracker', { year, month }], { dedupingInterval: 20_000 },
	);
	const lastSub = useSWR<{ ok: boolean; lastSub: { email: string | null; amount: number; currency: string; date: number; plan: string | null } | null }>(
		['/api/admin/revenue-tracker/last-paid-subscription'], { dedupingInterval: 5 * 60_000 },
	);

	const yearElapsed = year < todayYear ? 1 : year > todayYear ? 0 : getYearElapsed();
	const yearElapsedPct = Math.round(yearElapsed * 100);

	const [syncing, setSyncing] = useState(false);
	const syncAttio = async () => {
		setSyncing(true);
		try {
			const r = await api<{ ok: boolean; synced?: number; unavailable?: boolean; error?: string }>('POST', '/api/admin/revenue-tracker/sync');
			if (r.ok) { toast.success(`Synced ${r.synced} deals from Attio`); await mutate(); }
			else if (r.unavailable) toast.message('Attio isn’t configured on the server');
			else toast.error(r.error || 'Sync failed');
		} catch (e) { toast.error((e as Error).message); } finally { setSyncing(false); }
	};

	const saveTarget = async (scope: Target['scope'], product_id: string | null, field: string, value: number) => {
		try {
			await api('POST', '/api/admin/revenue-tracker/targets', { year, scope, product_id, [field]: value });
			await mutate();
		} catch (e) { toast.error((e as Error).message); }
	};

	const products = data?.products ?? [];
	const targetFor = (scope: Target['scope'], pid: string | null) =>
		(data?.targets ?? []).find((t) => t.scope === scope && (t.product_id ?? null) === pid);
	const companyMin = Number(targetFor('company_min', null)?.annual_target_eur ?? 0);
	const companyFull = Number(targetFor('company_full', null)?.annual_target_eur ?? 0);
	const totalRealized = data?.totalRealized ?? 0;

	return (
		<div style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
			{/* ── Sidebar: Data Input ─────────────────────────────────────────── */}
			<aside className="card" style={{ flex: '0 0 236px', minWidth: 220, padding: 0, position: 'sticky', top: 8 }}>
				<div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
					<span style={{ color: 'var(--accent)' }}>◆</span>
					<span style={{ fontWeight: 700, fontSize: 13 }}>Data input</span>
				</div>
				<div style={{ padding: 12, display: 'grid', gap: 18 }}>
					<div>
						<SideLabel>Filter period</SideLabel>
						<div style={{ display: 'grid', gap: 6 }}>
							<Select value={String(year)} onChange={(v) => setYear(Number(v))} width="100%" style={{ display: 'block', width: '100%' }} ariaLabel="Year"
								options={Array.from({ length: 5 }, (_, i) => todayYear - 2 + i).map((y) => ({ value: String(y), label: String(y) }))} />
							<Select value={String(month)} onChange={(v) => setMonth(Number(v))} width="100%" style={{ display: 'block', width: '100%' }} ariaLabel="Month"
								options={[{ value: '0', label: 'All year' }, ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))]} />
						</div>
					</div>

					<div>
						<SideLabel>Revenue &amp; targets by product</SideLabel>
						{isLoading ? <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Loading…</div> : (
							<div style={{ display: 'grid', gap: 12 }}>
								{products.map((p) => (
									<div key={p.id}>
										<div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fg-2)', marginBottom: 4 }}>{p.name}</div>
										<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
											<div>
												<div style={{ fontSize: 9.5, color: 'var(--fg-muted)' }}>Realized (€)</div>
												<div className="num" style={{ padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', fontSize: 11, marginTop: 2 }}>
													€ {Math.round(data?.realizedByProductId[p.id] ?? 0).toLocaleString('de-DE')}
												</div>
											</div>
											<div>
												<div style={{ fontSize: 9.5, color: 'var(--fg-muted)' }}>Target (€)</div>
												<div style={{ marginTop: 2 }}>
													<EditableAmount value={Number(targetFor('product', p.id)?.annual_target_eur ?? 0)} onSave={(v) => saveTarget('product', p.id, 'annual_target_eur', v)} full />
												</div>
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					<div>
						<SideLabel>Revenue by audience</SideLabel>
						{Object.entries(data?.realizedByAudience ?? {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([seg, v]) => (
							<div key={seg} style={{ marginBottom: 8 }}>
								<div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fg-2)', marginBottom: 3 }}>
									{AUDIENCE.find((a) => a.value === seg)?.label ?? seg}
								</div>
								<div className="num" style={{ padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-2)', fontSize: 11 }}>
									€ {Math.round(v).toLocaleString('de-DE')}
								</div>
							</div>
						))}
						{Object.keys(data?.realizedByAudience ?? {}).length === 0 && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>No revenue yet.</div>}
					</div>
				</div>
			</aside>

			{/* ── Main pane ───────────────────────────────────────────────────── */}
			<div style={{ flex: '1 1 560px', minWidth: 0, display: 'grid', gap: 'var(--space-4)' }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
					<div style={{ fontWeight: 700, fontSize: 15 }}>
						Revenue tracker — {month > 0 ? `${MONTHS[month - 1]} ${year}` : year}
						{month > 0 && <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--fg-muted)', marginLeft: 8 }}>annual targets are full-year</span>}
					</div>
					<button className="btn ghost" onClick={() => void mutate()} disabled={isLoading}><RefreshCw size={14} /> Refresh</button>
				</div>

				<div className="grid-4" style={{ gap: 'var(--space-3)' }}>
					<Headline label="Total realized" value={fmtEur(totalRealized)} sub={`${companyMin > 0 ? Math.round((totalRealized / companyMin) * 100) : 0}% of min target`} tone="var(--accent)" />
					<Headline label="Combined target" value={fmtEurShort(companyFull)} sub={`Gap: ${fmtEur(Math.max(0, companyFull - totalRealized))}`} />
					<Headline label="Min overall target" value={fmtEurShort(companyMin)} sub={`Gap: ${fmtEur(Math.max(0, companyMin - totalRealized))}`} />
					<Headline label="Year elapsed" value={`${yearElapsedPct}%`} sub={`Month ${new Date().getMonth() + 1} of 12`} />
				</div>

				<LastPaidSub data={lastSub.data} loading={lastSub.isLoading} onRefresh={() => void lastSub.mutate()} />

				<OverallProgress totalRealized={totalRealized} companyMin={companyMin} companyFull={companyFull} yearElapsed={yearElapsed}
					onSaveMin={(v) => saveTarget('company_min', null, 'annual_target_eur', v)}
					onSaveFull={(v) => saveTarget('company_full', null, 'annual_target_eur', v)} />

				<div className="card" style={{ padding: 'var(--space-4)' }}>
					<div style={{ fontWeight: 700 }}>Per-product progress</div>
					<div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 12 }}>Each bar scaled to its annual target · cursor = {yearElapsedPct}% year elapsed.</div>
					<div style={{ display: 'grid', gap: 12 }}>
						{products.map((p) => {
							const realized = data?.realizedByProductId[p.id] ?? 0;
							const target = Number(targetFor('product', p.id)?.annual_target_eur ?? 0);
							const pct = target > 0 ? Math.round((realized / target) * 100) : 0;
							const st = status(pct, yearElapsedPct);
							return (
								<div key={p.id}>
									<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 5, flexWrap: 'wrap' }}>
										<span style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</span>
										<span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
											<span className="num" style={{ color: 'var(--fg-muted)' }}>{fmtEur(realized)} / {fmtEur(target)}</span>
											<span className="tag" style={{ color: statusColor(st), borderColor: statusColor(st) }}>{pct}%</span>
											<span className="tag" style={{ color: statusColor(st), borderColor: statusColor(st) }}>{st}</span>
										</span>
									</div>
									<ProgressBar pct={target > 0 ? Math.min((realized / target) * 100, 100) : 0} cursorPct={yearElapsed * 100} color={statusColor(st)} label={fmtEur(realized)} />
								</div>
							);
						})}
					</div>
					<div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--fg-muted)', marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
						<Legend color="var(--pos)">On track</Legend>
						<Legend color="var(--warn)">Close (≤15% off)</Legend>
						<Legend color="var(--neg)">Behind</Legend>
						<Legend color="var(--accent)">Time cursor</Legend>
					</div>
					<div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
						<SalesTracker data={data} yearElapsed={yearElapsed} onSaveField={(pid, field, v) => saveTarget('product', pid, field, v)} />
					</div>
				</div>

				<RevenueMix data={data} products={products} />
				<PipelineSection data={data} products={products} onSync={syncAttio} syncing={syncing} lastSync={data?.lastPipelineSync ?? null} />
			</div>
		</div>
	);
}

function SideLabel({ children }: { children: React.ReactNode }) {
	return <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--fg-muted)', marginBottom: 8 }}>{children}</div>;
}
function Legend({ color, children }: { color: string; children: React.ReactNode }) {
	return <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}><span style={{ width: 12, height: 7, borderRadius: 2, background: color }} />{children}</span>;
}
function Headline({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: string }) {
	return (
		<div className="card" style={{ padding: 'var(--space-4)', borderTop: tone ? `2px solid ${tone}` : undefined }}>
			<div className="co-stat-label">{label}</div>
			<div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 4 }}>{value}</div>
			<div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{sub}</div>
		</div>
	);
}

/** Horizontal bar with a full-length visible track + optional in-bar label + time cursor. */
function ProgressBar({ pct, cursorPct, color, height = 30, label }: { pct: number; cursorPct: number; color: string; height?: number; label?: string }) {
	return (
		<div style={{ position: 'relative', height, borderRadius: 6, background: 'var(--bg-2)', border: '1px solid var(--border)', overflow: 'visible' }}>
			<div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 5, minWidth: pct > 0 ? 3 : 0, display: 'flex', alignItems: 'center' }}>
				{label && pct > 14 && <span style={{ padding: '0 8px', color: '#fff', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</span>}
			</div>
			<div style={{ position: 'absolute', top: -2, bottom: -2, left: `${Math.min(cursorPct, 100)}%`, width: 2, background: 'var(--accent)', zIndex: 2 }} title={`${Math.round(cursorPct)}% year elapsed`} />
		</div>
	);
}

function EditableAmount({ value, onSave, prefix = '€', full }: { value: number; onSave: (v: number) => void; prefix?: string; full?: boolean }) {
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(String(Math.round(value)));
	const w = full ? { width: '100%' } : {};
	if (!editing) {
		return (
			<button className="search-input" style={{ height: 24, padding: '0 6px', fontFamily: 'var(--font-mono)', fontSize: 11, cursor: 'text', minWidth: 60, ...w }}
				onClick={() => { setDraft(String(Math.round(value))); setEditing(true); }}>
				{prefix ? `${prefix} ` : ''}{Math.round(value).toLocaleString('de-DE')}
			</button>
		);
	}
	const commit = () => { const n = parseFloat(draft.replace(/[^\d.]/g, '')); if (!isNaN(n) && n >= 0) onSave(n); setEditing(false); };
	return (
		<input className="search-input num" style={{ height: 24, fontFamily: 'var(--font-mono)', fontSize: 11, width: full ? '100%' : 88 }} value={draft} autoFocus
			onChange={(e) => setDraft(e.target.value)} onBlur={commit}
			onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }} />
	);
}

function OverallProgress({ totalRealized, companyMin, companyFull, yearElapsed, onSaveMin, onSaveFull }: {
	totalRealized: number; companyMin: number; companyFull: number; yearElapsed: number;
	onSaveMin: (v: number) => void; onSaveFull: (v: number) => void;
}) {
	const full = companyFull > 0 ? companyFull : 1;
	const barPct = Math.min((totalRealized / full) * 100, 100);
	const minMarkerPct = companyFull > 0 ? Math.min((companyMin / companyFull) * 100, 100) : 0;
	const towardMin = companyMin > 0 ? Math.round((totalRealized / companyMin) * 100) : 0;
	const towardFull = companyFull > 0 ? Math.round((totalRealized / companyFull) * 100) : 0;
	const st = status(towardMin, Math.round(yearElapsed * 100));
	return (
		<div className="card" style={{ padding: 'var(--space-4)' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
				<div>
					<div style={{ fontWeight: 700 }}>Overall revenue progress</div>
					<div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
						Bar 0 → {fmtEurShort(companyFull)}. Marker = min ({fmtEurShort(companyMin)}). Cursor = {Math.round(yearElapsed * 100)}% elapsed.
					</div>
				</div>
				<span className="tag" style={{ color: statusColor(st), borderColor: statusColor(st) }}>{st}</span>
			</div>
			<div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--fg-muted)', margin: '8px 0' }}>
				<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>Min: <EditableAmount value={companyMin} onSave={onSaveMin} /></span>
				<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>Full: <EditableAmount value={companyFull} onSave={onSaveFull} /></span>
			</div>
			<div style={{ position: 'relative', height: 38, borderRadius: 6, background: 'var(--bg-2)', border: '1px solid var(--border)', marginBottom: 10 }}>
				<div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${barPct}%`, background: 'var(--warn)', borderRadius: 5, display: 'flex', alignItems: 'center' }}>
					{barPct > 8 && <span style={{ padding: '0 10px', color: '#fff', fontSize: 13, fontWeight: 700 }}>{fmtEur(totalRealized)}</span>}
				</div>
				{minMarkerPct > 0 && <div style={{ position: 'absolute', top: -2, bottom: -2, left: `${minMarkerPct}%`, width: 2, background: 'var(--fg)' }} title={`Min ${fmtEurShort(companyMin)}`} />}
				<div style={{ position: 'absolute', top: -2, bottom: -2, left: `${Math.min(yearElapsed * 100, 100)}%`, width: 2, background: 'var(--accent)', zIndex: 3 }} />
			</div>
			<div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: 'var(--fg-muted)' }}>
				<span><strong style={{ color: 'var(--fg)' }}>{towardMin}%</strong> toward min</span>
				<span><strong style={{ color: 'var(--fg)' }}>{towardFull}%</strong> toward full</span>
				<span>Time-adj. pace: <strong style={{ color: 'var(--fg)' }}>{fmtEur(companyMin * yearElapsed)}</strong></span>
			</div>
		</div>
	);
}

function SalesTracker({ data, yearElapsed, onSaveField }: {
	data?: TrackerData; yearElapsed: number;
	onSaveField: (pid: string, field: string, v: number) => void;
}) {
	const products = data?.products ?? [];
	const [slug, setSlug] = useState('playmakers');
	const product = products.find((p) => p.slug === slug) ?? products[0] ?? null;
	const target = (data?.targets ?? []).find((t) => t.scope === 'product' && t.product_id === product?.id);
	const unitsTarget = Number(target?.annual_units_target ?? 0);
	const tpYtd = product ? Number(data?.touchpointsBySlug[product.slug] ?? 0) : 0;
	const tpTarget = Number(target?.annual_touchpoints_target ?? 0);
	const unitsSold = product ? (data?.unitsSoldByProductId[product.id] ?? 0) : 0;
	const openWeighted = (data?.pipeline.deals ?? []).filter((d) => d.product_id === product?.id && !d.is_won && !d.is_lost).reduce((s, d) => s + Number(d.expected_revenue_eur), 0);
	const conv = unitsSold > 0 && tpYtd > 0 ? (unitsSold / tpYtd) * 100 : null;
	const unitsRemaining = unitsTarget > 0 ? Math.max(0, unitsTarget - unitsSold) : null;
	const tpNeeded = unitsSold > 0 && tpYtd > 0 && unitsRemaining != null ? Math.ceil(unitsRemaining / (unitsSold / tpYtd)) : null;
	const cursorPct = Math.min(yearElapsed * 100, 100);

	if (!product) return null;
	return (
		<div>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
				<div style={{ fontWeight: 700, fontSize: 13 }}>{product.name} — sales tracker</div>
				<Select value={slug} onChange={setSlug} width={190} ariaLabel="Product" options={products.map((p) => ({ value: p.slug, label: p.name }))} />
			</div>
			<div className="grid-3" style={{ gap: 'var(--space-3)', marginBottom: 12 }}>
				<MiniCard label="Annual units target"><EditableAmount value={unitsTarget} prefix="" onSave={(v) => onSaveField(product.id, 'annual_units_target', v)} /></MiniCard>
				<MiniCard label="Sales touchpoints (YTD)"><div style={{ fontSize: 18, fontWeight: 800 }}>{tpYtd.toLocaleString()}</div><div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>auto-synced from touchpoints</div></MiniCard>
				<MiniCard label="Touchpoints target (YTD)"><EditableAmount value={tpTarget} prefix="" onSave={(v) => onSaveField(product.id, 'annual_touchpoints_target', v)} /></MiniCard>
			</div>
			<div className="grid-4" style={{ gap: 'var(--space-3)', marginBottom: 12 }}>
				<Metric label="Units sold (YTD)" value={String(unitsSold)} sub={`${unitsTarget > 0 ? Math.round((unitsSold / unitsTarget) * 100) : 0}% of target`} tone="var(--pos)" />
				<Metric label="Conversion rate" value={conv != null ? conv.toFixed(1) + '%' : '—'} sub={tpYtd > 0 ? `${unitsSold} / ${tpYtd} TPs` : 'set touchpoints'} tone="oklch(55% 0.18 250)" />
				<Metric label="Units remaining" value={unitsRemaining != null ? String(unitsRemaining) : '—'} sub="to annual target" tone="var(--warn)" />
				<Metric label="Touchpoints needed" value={tpNeeded != null ? String(tpNeeded) : '—'} sub="at current conversion" tone="var(--neg)" />
			</div>
			<div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
				<div>
					<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span style={{ fontWeight: 600 }}>Units sold</span><span>{unitsSold} / {unitsTarget > 0 ? unitsTarget : '—'}</span></div>
					<ProgressBar pct={unitsTarget > 0 ? Math.min((unitsSold / unitsTarget) * 100, 100) : 0} cursorPct={cursorPct} color="var(--pos)" height={26} label={`${unitsSold} units`} />
				</div>
				<div>
					<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}><span style={{ fontWeight: 600 }}>Sales touchpoints (YTD)</span><span>{tpYtd} / {tpTarget > 0 ? tpTarget : '—'}</span></div>
					<ProgressBar pct={tpTarget > 0 ? Math.min((tpYtd / tpTarget) * 100, 100) : 0} cursorPct={cursorPct} color="oklch(55% 0.18 250)" height={26} label={`${tpYtd} TPs`} />
				</div>
			</div>
			<div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--fg-muted)' }}>
				<TrendingUp size={14} /> Open weighted pipeline: <strong style={{ color: 'var(--fg)' }}>{fmtEur(openWeighted)}</strong>
			</div>
		</div>
	);
}

function MiniCard({ label, children }: { label: string; children: React.ReactNode }) {
	return <div className="card" style={{ padding: 'var(--space-3)' }}><div className="co-stat-label" style={{ marginBottom: 6 }}>{label}</div>{children}</div>;
}
function Metric({ label, value, sub, tone }: { label: string; value: string; sub: string; tone: string }) {
	return (
		<div className="card" style={{ padding: 'var(--space-3)', borderLeft: `3px solid ${tone}` }}>
			<div className="co-stat-label">{label}</div>
			<div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{value}</div>
			<div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{sub}</div>
		</div>
	);
}

function RevenueMix({ data, products }: { data?: TrackerData; products: Product[] }) {
	const audSegs: PieSegment[] = Object.entries(data?.realizedByAudience ?? {})
		.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
		.map(([seg, v]) => ({ name: AUDIENCE.find((a) => a.value === seg)?.label ?? seg, v, color: AUDIENCE.find((a) => a.value === seg)?.color ?? 'var(--fg-muted)', label: fmtEur(v) }));
	const prodSegs: PieSegment[] = products
		.map((p) => ({ name: p.name, v: data?.realizedByProductId[p.id] ?? 0, color: PRODUCT_COLORS[p.slug] ?? 'var(--accent)', label: fmtEur(data?.realizedByProductId[p.id] ?? 0) }))
		.filter((s) => s.v > 0);
	return (
		<div className="card" style={{ padding: 'var(--space-4)' }}>
			<div style={{ fontWeight: 700, marginBottom: 12 }}>Revenue mix</div>
			<div className="grid-2" style={{ gap: 'var(--space-5)' }}>
				<div>
					<div className="co-stat-label" style={{ marginBottom: 8 }}>By audience segment</div>
					{audSegs.length === 0 ? <Empty /> : <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}><PieDonut segments={audSegs} size={150} mode="donut" /><div style={{ flex: 1, minWidth: 150 }}><PieLegend segments={audSegs} /></div></div>}
				</div>
				<div>
					<div className="co-stat-label" style={{ marginBottom: 8 }}>By product category</div>
					{prodSegs.length === 0 ? <Empty /> : <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}><PieDonut segments={prodSegs} size={150} mode="donut" /><div style={{ flex: 1, minWidth: 150 }}><PieLegend segments={prodSegs} /></div></div>}
				</div>
			</div>
		</div>
	);
}

const STAGE_WEIGHT: Record<string, number> = {
	'Closed Won': 100, 'Committed': 85, 'Interested / Nurturing': 60, 'Engaged': 20,
	'Invited / Decision Pending': 10, 'Contacted': 5, 'Identified': 2, 'Closed Lost': 0, 'Unstaged': -1,
};
const STAGE_COLOR: Record<string, string> = {
	'Closed Won': 'oklch(58% 0.15 150)', 'Closed Lost': 'oklch(58% 0.20 18)', 'Committed': 'oklch(55% 0.18 250)',
	'Contacted': 'oklch(70% 0.12 250)', 'Engaged': 'oklch(65% 0.15 65)', 'Identified': 'oklch(60% 0.03 250)',
	'Interested / Nurturing': 'oklch(60% 0.12 190)', 'Invited / Decision Pending': 'oklch(55% 0.20 300)', 'Unstaged': 'oklch(70% 0.02 250)',
};
const stageKey = (d: Deal) => d.is_won ? 'Closed Won' : d.is_lost ? 'Closed Lost' : (d.stage || 'Unstaged');
const byWeight = (a: string, b: string) => (STAGE_WEIGHT[b] ?? -1) - (STAGE_WEIGHT[a] ?? -1);

function relTime(iso: string | null): string {
	if (!iso) return 'never';
	const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
	if (s < 90) return 'just now';
	if (s < 3600) return `${Math.round(s / 60)}m ago`;
	if (s < 86400) return `${Math.round(s / 3600)}h ago`;
	return `${Math.round(s / 86400)}d ago`;
}

function PipelineSection({ data, products, onSync, syncing, lastSync }: { data?: TrackerData; products: Product[]; onSync: () => void; syncing: boolean; lastSync: string | null }) {
	const [view, setView] = useState<'product' | 'stage'>('stage');
	const [open, setOpen] = useState<Set<string>>(new Set());
	// Per-product drill-down: which stage's deals are being shown.
	const [pickedStage, setPickedStage] = useState<Record<string, string | null>>({});
	const deals = data?.pipeline.deals ?? [];
	const openDeals = deals.filter((d) => !d.is_won && !d.is_lost);

	const stageAgg = useMemo(() => {
		const m = new Map<string, { count: number; expected: number }>();
		for (const d of deals) {
			const k = stageKey(d);
			if (k === 'Closed Won') continue;
			const e = m.get(k) ?? { count: 0, expected: 0 };
			e.count++; e.expected += Number(d.expected_revenue_eur || 0); m.set(k, e);
		}
		return Array.from(m.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => byWeight(a.name, b.name));
	}, [deals]);

	const toggle = (id: string) => setOpen((p) => { const n = new Set(p); if (n.has(id)) { n.delete(id); setPickedStage((s) => ({ ...s, [id]: null })); } else n.add(id); return n; });

	return (
		<div className="card" style={{ padding: 'var(--space-4)' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
				<div><div style={{ fontWeight: 700 }}>Pipeline</div><div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>From Attio · synced {relTime(lastSync)}</div></div>
				<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
					<div style={{ display: 'inline-flex', gap: 4 }}>
						<button className={`chip ${view === 'product' ? 'on' : ''}`} onClick={() => setView('product')}>By product</button>
						<button className={`chip ${view === 'stage' ? 'on' : ''}`} onClick={() => setView('stage')}>By stage</button>
					</div>
					<button className="btn ghost" onClick={onSync} disabled={syncing} title="Pull latest deals from Attio"><RefreshCw size={14} /> {syncing ? 'Syncing…' : 'Sync from Attio'}</button>
				</div>
			</div>
			<div className="grid-2" style={{ gap: 'var(--space-3)', marginBottom: 12 }}>
				<Headline label="Open weighted pipeline" value={fmtEur(data?.pipeline.globalOpenWeighted ?? 0)} sub="expected revenue · open deals" />
				<Headline label="Units sold" value={String(data?.pipeline.globalWonCount ?? 0)} sub="deals won · all products" />
			</div>

			{view === 'stage' ? (
				<div>
					{(() => {
						const maxV = Math.max(1, ...stageAgg.map((r) => r.expected));
						return stageAgg.map((r) => (
							<div key={r.name} style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
								<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
									<span style={{ display: 'inline-flex', gap: 7, alignItems: 'center', fontSize: 13, fontWeight: 500 }}>
										<span style={{ width: 9, height: 9, borderRadius: '50%', background: STAGE_COLOR[r.name] ?? 'var(--fg-muted)', flexShrink: 0 }} />
										{r.name}<span style={{ color: 'var(--fg-muted)', fontWeight: 400 }}>· {r.count} deal{r.count === 1 ? '' : 's'}</span>
									</span>
									<span className="num" style={{ fontWeight: 700, fontSize: 13 }}>{r.expected > 0 ? fmtEur(r.expected) : '—'}</span>
								</div>
								{/* full-length track so the bar reads as a proportion */}
								<div style={{ height: 8, borderRadius: 4, background: 'var(--bg-2)', border: '1px solid var(--border)', overflow: 'hidden' }}>
									<div style={{ height: '100%', width: `${(r.expected / maxV) * 100}%`, background: STAGE_COLOR[r.name] ?? 'var(--fg-muted)' }} />
								</div>
							</div>
						));
					})()}
					<div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)', fontWeight: 800 }}>
						<span>Total · {stageAgg.reduce((s, r) => s + r.count, 0)} deals</span>
						<span className="num">{fmtEur(stageAgg.reduce((s, r) => s + r.expected, 0))}</span>
					</div>
				</div>
			) : (
				<div>
					{products.map((p) => {
						const pOpen = openDeals.filter((d) => d.product_id === p.id);
						const allDeals = deals.filter((d) => d.product_id === p.id);
						const weighted = pOpen.reduce((s, d) => s + Number(d.expected_revenue_eur), 0);
						const tps = pOpen.reduce((s, d) => s + Number(d.touchpoint_count || 0), 0);
						const isOpen = open.has(p.id);
						const maxWeighted = Math.max(1, ...products.map((x) => openDeals.filter((d) => d.product_id === x.id).reduce((s, d) => s + Number(d.expected_revenue_eur), 0)));
						// Stage breakdown for this product (includes won/lost).
						const stages = (() => {
							const m = new Map<string, { count: number; expected: number }>();
							for (const d of allDeals) { const k = stageKey(d); const e = m.get(k) ?? { count: 0, expected: 0 }; e.count++; e.expected += Number(d.expected_revenue_eur || 0); m.set(k, e); }
							return Array.from(m.entries()).map(([name, v]) => ({ name, ...v })).sort((a, b) => byWeight(a.name, b.name));
						})();
						const picked = pickedStage[p.id] ?? null;
						const stageDeals = picked ? allDeals.filter((d) => stageKey(d) === picked).sort((a, b) => b.expected_revenue_eur - a.expected_revenue_eur) : [];
						const segs: PieSegment[] = stages.map((s) => ({ name: s.name, v: s.count, color: STAGE_COLOR[s.name] ?? 'var(--fg-muted)', label: `${s.count} deal${s.count === 1 ? '' : 's'}` }));

						return (
							<div key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
								<button onClick={() => allDeals.length && toggle(p.id)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 0, cursor: allDeals.length ? 'pointer' : 'default', padding: '10px 2px', display: 'flex', alignItems: 'center', gap: 10, font: 'inherit', flexWrap: 'wrap' }}>
									<ChevronRight size={14} style={{ color: 'var(--fg-muted)', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform .15s', opacity: allDeals.length ? 1 : 0.2 }} />
									<span style={{ fontWeight: 600, fontSize: 13, width: 170 }}>{p.name}</span>
									<span style={{ fontSize: 12, width: 66, color: 'var(--fg-muted)' }}>{pOpen.length ? `${pOpen.length} open` : '—'}</span>
									<span className="num" style={{ fontSize: 12, width: 86, color: 'var(--fg-muted)' }}>{weighted > 0 ? fmtEur(weighted) : '—'}</span>
									<span style={{ fontSize: 12, width: 62, color: tps ? 'oklch(55% 0.18 250)' : 'var(--fg-muted)' }}>{tps ? `${tps} TPs` : '—'}</span>
									<span style={{ flex: 1, minWidth: 80, height: 8, borderRadius: 4, background: 'var(--bg-2)', border: '1px solid var(--border)', overflow: 'hidden' }}>
										<span style={{ display: 'block', height: '100%', width: `${(weighted / maxWeighted) * 100}%`, background: PRODUCT_COLORS[p.slug] ?? 'var(--accent)' }} />
									</span>
								</button>

								{isOpen && allDeals.length > 0 && (
									<div style={{ paddingLeft: 26, paddingBottom: 12 }}>
										{picked === null ? (
											// Stage breakdown: donut + clickable legend
											<div className="card" style={{ padding: 'var(--space-3)' }}>
												<div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
													<PieDonut segments={segs} size={130} mode="donut" />
													<div style={{ flex: 1, minWidth: 240 }}>
														<div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 6 }}>Click a stage to view its deals</div>
														{stages.map((s) => (
															<button key={s.name} onClick={() => setPickedStage((prev) => ({ ...prev, [p.id]: s.name }))}
																className="btn ghost" style={{ width: '100%', justifyContent: 'space-between', height: 26, padding: '0 6px', fontSize: 12 }}>
																<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
																	<span style={{ width: 9, height: 9, borderRadius: 2, background: STAGE_COLOR[s.name] ?? 'var(--fg-muted)' }} />{s.name}
																</span>
																<span style={{ display: 'inline-flex', gap: 10 }}>
																	<span className="num" style={{ fontWeight: 600 }}>{s.count} deals</span>
																	<span className="num" style={{ color: 'var(--fg-muted)' }}>{fmtEur(s.expected)}</span>
																</span>
															</button>
														))}
													</div>
												</div>
											</div>
										) : (
											<div>
												<div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6 }}>
													<button className="btn ghost" style={{ height: 24, fontSize: 12 }} onClick={() => setPickedStage((prev) => ({ ...prev, [p.id]: null }))}>← Back to stages</button>
													<span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{picked} · {stageDeals.length} deals</span>
												</div>
												<div className="table-scroll">
													<table className="data-table">
														<thead><tr><th>Prospect</th><th style={{ textAlign: 'right' }}>Touchpoints</th><th style={{ textAlign: 'right' }}>Deal value</th><th style={{ textAlign: 'right' }}>Expected</th></tr></thead>
														<tbody>
															{stageDeals.map((d) => (
																<tr key={d.id}>
																	<td>{d.attio_company_id
																		? <a href={`https://app.attio.com/sportstechx/company/${d.attio_company_id}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', display: 'inline-flex', gap: 3, alignItems: 'center' }}>{d.prospect_name || 'Unnamed'}<ExternalLink size={10} /></a>
																		: (d.prospect_name || '—')}</td>
																	<td className="num" style={{ textAlign: 'right', color: d.touchpoint_count ? 'oklch(55% 0.18 250)' : 'var(--fg-muted)' }}>{d.touchpoint_count || '—'}</td>
																	<td className="num" style={{ textAlign: 'right' }}>{d.deal_value_net_eur > 0 ? fmtEur(d.deal_value_net_eur) : '—'}</td>
																	<td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{fmtEur(d.expected_revenue_eur)}</td>
																</tr>
															))}
														</tbody>
													</table>
												</div>
											</div>
										)}
									</div>
								)}
							</div>
						);
					})}
					{openDeals.length === 0 && <div style={{ textAlign: 'center', padding: 24, color: 'var(--fg-muted)', fontSize: 13 }}>No open deals in pipeline.</div>}
				</div>
			)}
		</div>
	);
}

function LastPaidSub({ data, loading, onRefresh }: { data?: { ok: boolean; lastSub: { email: string | null; amount: number; currency: string; date: number; plan: string | null } | null }; loading: boolean; onRefresh: () => void }) {
	const sub = data?.lastSub;
	const daysSince = sub ? Math.floor((Date.now() / 1000 - sub.date) / 86400) : null;
	const tone = daysSince == null ? 'var(--fg-muted)' : daysSince <= 3 ? 'var(--pos)' : daysSince <= 14 ? 'var(--warn)' : 'var(--neg)';
	return (
		<div className="card" style={{ padding: 'var(--space-4)', display: 'flex', gap: 20, alignItems: 'center', position: 'relative', flexWrap: 'wrap' }}>
			<button className="btn ghost" style={{ position: 'absolute', right: 8, top: 8, height: 26, width: 26, padding: 0, justifyContent: 'center' }} onClick={onRefresh} disabled={loading} title="Refresh"><RefreshCw size={13} /></button>
			<div style={{ textAlign: 'center', minWidth: 80 }}>
				{loading ? <div className="skeleton-bar" style={{ width: 48, height: 40, margin: '0 auto' }} />
					: data?.ok === false ? <AlertCircle size={28} style={{ color: 'var(--neg)' }} />
						: <><div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 800, lineHeight: 1, color: tone }}>{daysSince ?? '—'}</div><div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-muted)' }}>days ago</div></>}
			</div>
			<div style={{ width: 1, height: 44, background: 'var(--border)' }} />
			<div style={{ flex: 1, minWidth: 200 }}>
				<div className="co-stat-label" style={{ marginBottom: 6 }}>Last new paid subscription</div>
				{data?.ok === false ? <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Stripe unavailable.</div>
					: sub ? (
						<div style={{ display: 'grid', gap: 4 }}>
							<div style={{ display: 'flex', gap: 6, alignItems: 'center', fontWeight: 600, fontSize: 13 }}><Mail size={13} style={{ color: 'var(--fg-muted)' }} />{sub.email ?? '—'}</div>
							<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--fg-muted)' }}>
								<span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Clock size={12} />{new Date(sub.date * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
								<span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><CreditCard size={12} />{sub.currency} {sub.amount.toLocaleString('de-DE')}</span>
								{sub.plan && <span className="tag">{sub.plan}</span>}
							</div>
						</div>
					) : <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>No subscription found.</div>}
			</div>
		</div>
	);
}

function Empty() { return <div style={{ color: 'var(--fg-muted)', fontSize: 13, padding: 8 }}>No data.</div>; }
