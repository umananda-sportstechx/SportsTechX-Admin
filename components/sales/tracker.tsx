'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { DollarSign, ShoppingCart, TrendingUp, Users, RefreshCw } from 'lucide-react';
import { AsyncState, Section } from '@/components/atoms';
import { Select } from '@/components/select';
import { PieDonut, PieLegend, ComboBarLine, CHART_COLORS, type PieSegment } from '@/components/charts';

/**
 * Sales Tracker — read-only analytics over the manual sales_records ledger,
 * laid out to mirror the legacy STX-WebApp "Sales" Analytics sub-tab:
 * Revenue Overview (6 fixed period cards) → date filter → 4 summary tables →
 * 4 KPI cards → Revenue Over Time → 3 chart rows → Discount Analysis.
 */

interface Group { name: string; revenue: number; count: number }
interface Analytics {
	kpis: { revenue: number; sales: number; avg_deal: number; clients: number };
	monthly: Array<{ month: string; revenue: number; count: number }>;
	byCategory: Group[];
	byProduct: Group[];
	byClientType: Group[];
	byLeadSource: Group[];
	byQuarter: Group[];
	topClients: Group[];
	discount: Group[];
}
interface PeriodCard { revenue: number; count: number }
interface PeriodCards {
	this_week: PeriodCard; this_month: PeriodCard; this_quarter: PeriodCard;
	this_year: PeriodCard; last_3_years: PeriodCard; all_time: PeriodCard;
}

// The ledger has no currency column; the legacy admin formatted it as EUR.
const money = (n: number, digits = 0) => {
	try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n); }
	catch { return `€${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: digits })}`; }
};

const PRESETS = [
	{ value: 'this_week', label: 'This week' },
	{ value: 'this_month', label: 'This month' },
	{ value: 'this_quarter', label: 'This quarter' },
	{ value: 'this_year', label: 'This year' },
	{ value: 'last_3_years', label: 'Last 3 years' },
	{ value: 'all_time', label: 'All time' },
	{ value: 'custom', label: 'Custom' },
] as const;
type PresetKey = (typeof PRESETS)[number]['value'];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function presetRange(preset: PresetKey): { start?: string; end?: string } {
	const now = new Date();
	const y = now.getFullYear();
	const end = iso(now);
	switch (preset) {
		case 'this_week': { const m = new Date(now); const day = m.getDay(); m.setDate(m.getDate() + (day === 0 ? -6 : 1 - day)); return { start: iso(m), end }; }
		case 'this_month': return { start: iso(new Date(y, now.getMonth(), 1)), end };
		case 'this_quarter': return { start: iso(new Date(y, Math.floor(now.getMonth() / 3) * 3, 1)), end };
		case 'this_year': return { start: iso(new Date(y, 0, 1)), end };
		case 'last_3_years': return { start: iso(new Date(y - 2, 0, 1)), end };
		default: return {};
	}
}

export function SalesTracker() {
	const [preset, setPreset] = useState<PresetKey>('this_year');
	const [customStart, setCustomStart] = useState('');
	const [customEnd, setCustomEnd] = useState('');

	const range = useMemo(() => {
		if (preset === 'custom') return { start: customStart || undefined, end: customEnd || undefined };
		return presetRange(preset);
	}, [preset, customStart, customEnd]);

	const cards = useSWR<PeriodCards>(['/api/admin/sales-records/period-cards'], { dedupingInterval: 60_000 });
	const { data: a, error, isLoading, mutate } = useSWR<Analytics>(
		['/api/admin/sales-records/analytics', { start_date: range.start, end_date: range.end }],
		{ dedupingInterval: 30_000 },
	);

	const c = cards.data;
	const periodCards: Array<[string, PeriodCard | undefined]> = [
		['This Week', c?.this_week], ['This Month', c?.this_month], ['This Quarter', c?.this_quarter],
		['This Year', c?.this_year], ['Last 3 Years', c?.last_3_years], ['All Time', c?.all_time],
	];

	const monthChart = (a?.monthly ?? []).map((m) => ({
		label: new Date(`${m.month}-01`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
		amt: m.revenue, deals: m.count,
	}));
	const quarterChart = (a?.byQuarter ?? []).map((qr) => ({ label: qr.name, amt: qr.revenue, deals: qr.count }));
	const barSegs = (rows: Group[] | undefined): PieSegment[] =>
		(rows ?? []).map((r, i) => ({ name: r.name || '—', v: r.revenue, color: CHART_COLORS[i % CHART_COLORS.length]!, label: money(r.revenue) }));

	const disc = Object.fromEntries((a?.discount ?? []).map((d) => [d.name, d]));

	return (
		<div style={{ display: 'grid', gap: 'var(--space-5)' }}>
			{/* ── Revenue Overview — 6 fixed period cards (never change with filter) ── */}
			<div>
				<p className="co-stat-label" style={{ marginBottom: 12 }}>Revenue overview</p>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)' }}>
					{periodCards.map(([label, pc]) => (
						<PeriodStat key={label} label={label} loading={cards.isLoading} revenue={money(pc?.revenue ?? 0)} count={pc?.count ?? 0} />
					))}
				</div>
			</div>

			{/* ── Filtered section ─────────────────────────────────────────────── */}
			<div style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-5)', display: 'grid', gap: 'var(--space-5)' }}>
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
						<Select value={preset} onChange={(v) => setPreset(v as PresetKey)} options={PRESETS.map((p) => ({ value: p.value, label: p.label }))} width={170} ariaLabel="Date range" />
						{preset === 'custom' && (
							<>
								<input className="search-input" type="date" style={{ height: 32 }} value={customStart} onChange={(e) => setCustomStart(e.target.value)} aria-label="Start date" />
								<span style={{ color: 'var(--fg-muted)' }}>–</span>
								<input className="search-input" type="date" style={{ height: 32 }} value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} aria-label="End date" />
							</>
						)}
					</div>
					<button className="btn ghost" onClick={() => void mutate()} disabled={isLoading}>
						<RefreshCw size={14} /> Refresh
					</button>
				</div>

				<AsyncState loading={isLoading} error={error} empty={!isLoading && (a?.kpis.sales ?? 0) === 0} emptyMsg="No sales records in this period." onRetry={() => void mutate()}>
					{/* ── 4 summary tables ─────────────────────────────────────────── */}
					<div className="grid-4" style={{ gap: 'var(--space-4)' }}>
						<SummaryTable title="By category" rows={a?.byCategory} />
						<SummaryTable title="By product / service" rows={a?.byProduct} />
						<SummaryTable title="By client type" rows={a?.byClientType} />
						<SummaryTable title="Top clients" rows={a?.topClients} />
					</div>

					{/* ── 4 KPI cards ──────────────────────────────────────────────── */}
					<div className="grid-4" style={{ gap: 'var(--space-4)' }}>
						<KpiCard title="Total revenue" value={money(a?.kpis.revenue ?? 0)} Icon={DollarSign} tone="oklch(54% 0.15 155)" />
						<KpiCard title="Total sales" value={(a?.kpis.sales ?? 0).toLocaleString()} Icon={ShoppingCart} tone="oklch(55% 0.18 250)" />
						<KpiCard title="Avg deal size" value={money(a?.kpis.avg_deal ?? 0)} Icon={TrendingUp} tone="oklch(53% 0.20 305)" />
						<KpiCard title="Unique clients" value={(a?.kpis.clients ?? 0).toLocaleString()} Icon={Users} tone="oklch(57% 0.13 65)" />
					</div>

					{/* ── Revenue over time ────────────────────────────────────────── */}
					<ChartCard title="Revenue over time">
						{monthChart.length === 0 ? <Empty /> : <ComboBarLine data={monthChart} height={300} barLabel="Revenue" lineLabel="deals" valueFormatter={money} />}
					</ChartCard>

					{/* ── Chart rows (2-up), same pairing as legacy ────────────────── */}
					<div className="grid-2" style={{ gap: 'var(--space-4)' }}>
						<ChartCard title="Revenue by product category">
							{(a?.byCategory.length ?? 0) === 0 ? <Empty /> : <PieDonut segments={barSegs(a?.byCategory)} mode="bar" />}
						</ChartCard>
						<ChartCard title="Revenue by client type">
							<Donut segments={barSegs(a?.byClientType)} />
						</ChartCard>
					</div>

					<div className="grid-2" style={{ gap: 'var(--space-4)' }}>
						<ChartCard title="Top 10 clients by revenue">
							{(a?.topClients.length ?? 0) === 0 ? <Empty /> : <PieDonut segments={barSegs(a?.topClients)} mode="bar" />}
						</ChartCard>
						<ChartCard title="Revenue by lead source">
							<Donut segments={barSegs(a?.byLeadSource)} />
						</ChartCard>
					</div>

					<div className="grid-2" style={{ gap: 'var(--space-4)' }}>
						<ChartCard title="Revenue by quarter">
							{quarterChart.length === 0 ? <Empty /> : <ComboBarLine data={quarterChart} height={300} barLabel="Revenue" lineLabel="deals" valueFormatter={money} />}
						</ChartCard>
						<ChartCard title="Top 10 products / services">
							{(a?.byProduct.length ?? 0) === 0 ? <Empty /> : <PieDonut segments={barSegs(a?.byProduct)} mode="bar" />}
						</ChartCard>
					</div>

					{/* ── Discount analysis ────────────────────────────────────────── */}
					<ChartCard title="Discount analysis">
						<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)' }}>
							{['Yes', 'No'].map((k, i) => {
								const d = disc[k] as Group | undefined;
								return (
									<div key={k} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 'var(--space-4)', textAlign: 'center' }}>
										<div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 4 }}>Discount: {k}</div>
										<div style={{ fontSize: 20, fontWeight: 800, color: CHART_COLORS[i % CHART_COLORS.length] }}>{money(d?.revenue ?? 0)}</div>
										<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{(d?.count ?? 0).toLocaleString()} sale{(d?.count ?? 0) === 1 ? '' : 's'}</div>
									</div>
								);
							})}
						</div>
					</ChartCard>
				</AsyncState>
			</div>
		</div>
	);
}

function Empty() { return <div style={{ color: 'var(--fg-muted)', fontSize: 13, padding: 8 }}>No data in this period.</div>; }

// Fixed-period revenue card (revenue + deal count).
function PeriodStat({ label, revenue, count, loading }: { label: string; revenue: string; count: number; loading?: boolean }) {
	return (
		<div className="card" style={{ padding: 'var(--space-4)' }}>
			<div style={{ fontSize: 11, fontWeight: 500, color: 'var(--fg-muted)', marginBottom: 4 }}>{label}</div>
			{loading ? <div className="skeleton-bar" style={{ width: 90, height: 20, marginTop: 4 }} /> : (
				<div style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>{revenue}</div>
			)}
			{!loading && <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: 2 }}>{count} deal{count === 1 ? '' : 's'}</div>}
		</div>
	);
}

// KPI card with an icon badge (matches the legacy KPICard layout).
function KpiCard({ title, value, Icon, tone }: { title: string; value: React.ReactNode; Icon: React.ElementType; tone: string }) {
	return (
		<div className="card" style={{ padding: 'var(--space-4)' }}>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
				<div style={{ minWidth: 0 }}>
					<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{title}</div>
					<div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 4 }}>{value}</div>
				</div>
				<div style={{ borderRadius: '50%', padding: 12, background: 'color-mix(in oklch, var(--bg-2), transparent 0%)', color: tone, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
					<Icon size={20} />
				</div>
			</div>
		</div>
	);
}

// Card wrapper with a header, matching the admin card style used across the app.
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="card">
			<div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 14 }}>{title}</div>
			<div style={{ padding: 'var(--space-4)' }}>{children}</div>
		</div>
	);
}

function Donut({ segments }: { segments: PieSegment[] }) {
	if (segments.length === 0) return <Empty />;
	return (
		<div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
			<PieDonut segments={segments} size={190} mode="donut" />
			<div style={{ flex: 1, minWidth: 170 }}><PieLegend segments={segments} /></div>
		</div>
	);
}

// Ranked breakdown with a thin %-of-total bar + Total footer (legacy SummaryTable).
function SummaryTable({ title, rows }: { title: string; rows?: Group[] }) {
	const list = rows ?? [];
	const total = list.reduce((s, r) => s + r.revenue, 0);
	return (
		<div className="card" style={{ padding: 'var(--space-4)' }}>
			<div className="co-stat-label" style={{ marginBottom: 8 }}>{title}</div>
			{list.length === 0 && <div style={{ fontSize: 12, color: 'var(--fg-muted)', padding: '4px 0' }}>No data</div>}
			{list.map((r, i) => {
				const pct = total > 0 ? (r.revenue / total) * 100 : 0;
				return (
					<div key={i} style={{ padding: '6px 0', borderBottom: i === list.length - 1 ? 'none' : '1px solid var(--border)' }}>
						<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
							<span style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }} title={r.name || '—'}>{r.name || '—'}</span>
							<span className="num" style={{ fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{money(r.revenue)}</span>
						</div>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
							<div className="hb-bar" style={{ flex: 1, height: 4 }}>
								<div className="hb-bar-fill" style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
							</div>
							<span className="num" style={{ fontSize: 10, color: 'var(--fg-muted)', width: 32, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
						</div>
					</div>
				);
			})}
			{total > 0 && (
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
					<span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Total</span>
					<span className="num" style={{ fontSize: 12, fontWeight: 800 }}>{money(total)}</span>
				</div>
			)}
		</div>
	);
}
