'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { StatCard, AsyncState, Section } from '@/components/atoms';
import { StatStrip } from '@/components/filters';
import { SegToggle, PieDonut, PieLegend, ComboBarLine, toSegments, CHART_COLORS, type PieSegment } from '@/components/charts';

/**
 * Sales Tracker — read-only analytics over the manual sales_records ledger
 * (the legacy "Sales" Analytics sub-tab). Six at-a-glance period cards, a
 * date-range filter driving KPIs + a monthly trend + category/client/quarter
 * breakdowns. All numbers come from /api/admin/sales-records/{period-cards,analytics}.
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

// The Sales Master ledger has no currency column; the legacy admin formatted it
// as EUR, so we match that. ponytail: single-currency, add a currency column if
// multi-currency invoicing is ever needed.
const money = (n: number, digits = 0) => {
	try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n); }
	catch { return `€${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: digits })}`; }
};

const PRESETS = [
	{ key: 'this_week', label: 'This week' },
	{ key: 'this_month', label: 'This month' },
	{ key: 'this_quarter', label: 'This quarter' },
	{ key: 'this_year', label: 'This year' },
	{ key: 'last_3_years', label: 'Last 3 years' },
	{ key: 'all_time', label: 'All time' },
	{ key: 'custom', label: 'Custom' },
] as const;
type PresetKey = (typeof PRESETS)[number]['key'];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Preset → [start, end] (undefined = unbounded). Mirrors the SQL date_trunc bounds.
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
		['This week', c?.this_week], ['This month', c?.this_month], ['This quarter', c?.this_quarter],
		['This year', c?.this_year], ['Last 3 years', c?.last_3_years], ['All time', c?.all_time],
	];

	const monthChart = (a?.monthly ?? []).map((m) => ({
		label: new Date(`${m.month}-01`).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
		amt: m.revenue, deals: m.count,
	}));
	const barSegs = (rows: Group[] | undefined): PieSegment[] =>
		toSegments((rows ?? []).map((r) => ({ label: r.name, value: r.revenue })), { format: money });
	const donutSegs = (rows: Group[] | undefined): PieSegment[] =>
		(rows ?? []).map((r, i) => ({ name: r.name, v: r.revenue, color: CHART_COLORS[i % CHART_COLORS.length]!, label: money(r.revenue) }));

	const disc = Object.fromEntries((a?.discount ?? []).map((d) => [d.name, d]));
	const discYes = disc['Yes'] as Group | undefined;
	const discNo = disc['No'] as Group | undefined;
	const discRate = a && a.kpis.sales > 0 ? ((discYes?.count ?? 0) / a.kpis.sales) * 100 : 0;

	return (
		<div>
			{/* ── Revenue Overview — 6 fixed period cards ─────────────────────── */}
			<Section title="Revenue overview" meta="fixed periods — independent of the filter below">
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)' }}>
					{periodCards.map(([label, pc]) => (
						<MiniStat key={label} label={label} loading={cards.isLoading} value={money(pc?.revenue ?? 0)}
							sub={`${(pc?.count ?? 0).toLocaleString()} deal${(pc?.count ?? 0) === 1 ? '' : 's'}`} />
					))}
				</div>
			</Section>

			{/* ── Date-range filter ───────────────────────────────────────────── */}
			<div className="filter-bar" style={{ margin: 'var(--space-4) 0' }}>
				<SegToggle options={PRESETS.map((p) => ({ value: p.key, label: p.label }))} value={preset} onChange={(v) => setPreset(v as PresetKey)} />
				{preset === 'custom' && (
					<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--fg-muted)' }}>
						<input className="search-input" type="date" style={{ height: 32 }} value={customStart} onChange={(e) => setCustomStart(e.target.value)} aria-label="Start date" />
						<span>–</span>
						<input className="search-input" type="date" style={{ height: 32 }} value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} aria-label="End date" />
					</span>
				)}
				<div style={{ flex: 1 }} />
				<button className="btn ghost" onClick={() => void mutate()}>Refresh</button>
			</div>

			{/* ── KPI cards ───────────────────────────────────────────────────── */}
			<StatStrip cols={4}>
				<StatCard label="Total revenue" loading={isLoading} value={money(a?.kpis.revenue ?? 0)} />
				<StatCard label="Total sales" loading={isLoading} value={(a?.kpis.sales ?? 0).toLocaleString()} />
				<StatCard label="Avg deal size" loading={isLoading} value={money(a?.kpis.avg_deal ?? 0)} />
				<StatCard label="Unique clients" loading={isLoading} value={(a?.kpis.clients ?? 0).toLocaleString()} />
			</StatStrip>

			<AsyncState loading={isLoading} error={error} empty={!isLoading && (a?.kpis.sales ?? 0) === 0} emptyMsg="No sales records in this period." onRetry={() => void mutate()}>
				<div className="card" style={{ marginBottom: 'var(--space-5)' }}>
					<div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Revenue over time <span style={{ fontWeight: 400, color: 'var(--fg-muted)', fontSize: 12 }}>· bars = revenue · line = deals</span></div>
					<div style={{ padding: 'var(--space-4)' }}>
						{monthChart.length === 0 ? <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>No dated records in this period.</div>
							: <ComboBarLine data={monthChart} height={260} barLabel="Revenue" lineLabel="deals" valueFormatter={money} />}
					</div>
				</div>

				<div className="grid-2" style={{ marginBottom: 'var(--space-5)' }}>
					<Section title="By product category">
						{(a?.byCategory.length ?? 0) === 0 ? <Empty /> : <PieDonut segments={barSegs(a?.byCategory)} mode="bar" />}
					</Section>
					<Section title="By client type">
						<Split segments={donutSegs(a?.byClientType)} />
					</Section>
				</div>

				<div className="grid-2" style={{ marginBottom: 'var(--space-5)' }}>
					<Section title="Top clients" meta="by revenue">
						{(a?.topClients.length ?? 0) === 0 ? <Empty /> : <PieDonut segments={barSegs(a?.topClients)} mode="bar" />}
					</Section>
					<Section title="By lead source">
						<Split segments={donutSegs(a?.byLeadSource)} />
					</Section>
				</div>

				<div className="grid-2" style={{ marginBottom: 'var(--space-5)' }}>
					<Section title="Top products / services" meta="by revenue">
						{(a?.byProduct.length ?? 0) === 0 ? <Empty /> : <PieDonut segments={barSegs(a?.byProduct)} mode="bar" />}
					</Section>
					<Section title="By quarter">
						{(a?.byQuarter.length ?? 0) === 0 ? <Empty /> : <PieDonut segments={barSegs(a?.byQuarter)} mode="bar" />}
					</Section>
				</div>

				<Section title="Discount analysis">
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)' }}>
						<MiniStat label="Discounted revenue" value={money(discYes?.revenue ?? 0)} sub={`${(discYes?.count ?? 0).toLocaleString()} deals`} />
						<MiniStat label="Full-price revenue" value={money(discNo?.revenue ?? 0)} sub={`${(discNo?.count ?? 0).toLocaleString()} deals`} />
						<MiniStat label="Discount rate" value={`${discRate.toFixed(1)}%`} sub="of all deals" />
					</div>
				</Section>
			</AsyncState>
		</div>
	);
}

function Empty() { return <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>No data in this period.</div>; }

// StatCard has no sub-line slot; this compact card carries a value + sub caption.
function MiniStat({ label, value, sub, loading }: { label: string; value: React.ReactNode; sub?: string; loading?: boolean }) {
	return (
		<div className="card" style={{ padding: 'var(--space-4)' }}>
			<div className="co-stat-label">{label}</div>
			{loading ? <div className="skeleton-bar" style={{ width: 64, height: 22, marginTop: 8 }} /> : (
				<div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 4 }}>{value}</div>
			)}
			{sub && <div style={{ fontSize: 11, marginTop: 4, color: 'var(--fg-muted)' }}>{sub}</div>}
		</div>
	);
}

function Split({ segments }: { segments: PieSegment[] }) {
	if (segments.length === 0) return <Empty />;
	return (
		<div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
			<PieDonut segments={segments} size={180} mode="donut" />
			<div style={{ flex: 1, minWidth: 170 }}><PieLegend segments={segments} /></div>
		</div>
	);
}
