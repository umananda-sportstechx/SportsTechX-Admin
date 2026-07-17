'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { RefreshCw } from 'lucide-react';
import { AsyncState, Section } from '@/components/atoms';
import { PieDonut, PieLegend, type PieSegment } from '@/components/charts';
import { EUR, fmtDate, PRODUCT_COLORS } from './constants';

interface Move { date: string; description: string; counterparty?: string | null; amount: number; category?: string | null }
interface Gate { label: string; cumulative_target: number | null; additional_needed: number | null; status: string; required_daily_pace: number | null }
interface Dash {
	as_of: string; cash_today: number;
	daily_cash_forecast: { series: Array<{ date: string; balance: number }>; first_negative_date: string | null; lowest_point: { date: string; balance: number }; transactions_by_date: Record<string, Array<{ description: string; amount: number }>> };
	this_month_collections: { amount: number; target: number; pct_of_target: number; days_elapsed: number; days_in_month: number };
	overdue_customer_payments: { count: number; total: number; rows: Array<{ due_date: string; counterparty: string | null; description: string; amount: number; days_overdue: number }> };
	collection_milestones: { collected_actual: number; collected_pending: number; secured_total: number; additional_booked_since_policy_start: number; time_adjusted_pace: number; days_elapsed_in_year: number; gates: Gate[] };
	collections_breakdown: { monthly: Array<number | null>; monthly_target_flat: number };
	product_breakdown: Array<{ business_area: string; amount: number; pct: number }>;
	upcoming_cash_movements: { next_incoming: Move[]; next_outgoing: Move[]; largest_commitments_30d: Move[] };
	cash_risks: { largest_forecast_outflows: Move[]; overdue_customer_payments: Array<{ due_date: string; days_overdue: number; counterparty: string | null; description: string; amount: number }> };
	notes: Record<string, number>;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function CashDashboard() {
	const { data, error, isLoading, mutate } = useSWR<Dash>(['/api/cash/dashboard'], { dedupingInterval: 30_000 });
	const [drill, setDrill] = useState<string | null>(null);

	return (
		<div style={{ display: 'grid', gap: 'var(--space-4)' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
				<span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>SportsTechX GmbH · reconciled {data?.as_of ?? '—'}</span>
				<button className="btn ghost" onClick={() => void mutate()} disabled={isLoading}><RefreshCw size={14} /> Refresh</button>
			</div>

			<AsyncState loading={isLoading} error={error} empty={!isLoading && !data} onRetry={() => void mutate()}>
				{data && <Body d={data} drill={drill} setDrill={setDrill} />}
			</AsyncState>
		</div>
	);
}

function Body({ d, drill, setDrill }: { d: Dash; drill: string | null; setDrill: (s: string | null) => void }) {
	const c = d.this_month_collections;
	const daysNeg = d.daily_cash_forecast.first_negative_date ? Math.max(0, Math.floor((new Date(d.daily_cash_forecast.first_negative_date).getTime() - Date.now()) / 86400000)) : null;
	const projYearEnd = d.notes.projected_year_end_balance ?? 0;

	const prodSegs: PieSegment[] = d.product_breakdown.map((p) => ({ name: p.business_area, v: p.amount, color: PRODUCT_COLORS[p.business_area] ?? 'var(--fg-muted)', label: EUR(p.amount) }));
	const maxMonthly = Math.max(d.collections_breakdown.monthly_target_flat, ...d.collections_breakdown.monthly.map((m) => m ?? 0)) || 1;

	return (
		<>
			{/* KPI row */}
			<div className="grid-4" style={{ gap: 'var(--space-3)' }}>
				<Kpi label="Cash today" value={EUR(d.cash_today)} sub={`as of ${d.as_of}`} />
				<Kpi label="Projected year-end" value={EUR(projYearEnd)} tone={projYearEnd < 0 ? 'var(--neg)' : undefined} />
				<Kpi label="Days until cash negative" value={daysNeg == null ? '—' : String(daysNeg)} sub={d.daily_cash_forecast.first_negative_date ?? 'none projected'} tone={daysNeg != null && daysNeg < 60 ? 'var(--neg)' : undefined} />
				<Kpi label="This-month collections" value={EUR(c.amount)} sub={`${c.pct_of_target}% of target · day ${c.days_elapsed}/${c.days_in_month}`} tone={c.pct_of_target >= 50 ? 'var(--pos)' : 'var(--warn)'} />
			</div>
			<div className="grid-4" style={{ gap: 'var(--space-3)' }}>
				<Kpi label="Overdue customer payments" value={EUR(d.overdue_customer_payments.total)} sub={`${d.overdue_customer_payments.count} invoice(s)`} tone="var(--warn)" />
				<Kpi label="Secured so far (year)" value={EUR(d.collection_milestones.secured_total)} sub={`actual ${EUR(d.collection_milestones.collected_actual)} + pending ${EUR(d.collection_milestones.collected_pending)}`} />
				<Kpi label="Time-adjusted pace" value={EUR(d.collection_milestones.time_adjusted_pace)} sub={`${d.collection_milestones.days_elapsed_in_year} days elapsed`} />
				<Kpi label="Booked since policy start" value={EUR(d.collection_milestones.additional_booked_since_policy_start)} />
			</div>

			{/* Collection gates */}
			<Section title="Collection milestones — payout gates">
				<div className="table-scroll">
					<table className="data-table">
						<thead><tr><th>Gate</th><th style={{ textAlign: 'right' }}>Cumulative</th><th style={{ textAlign: 'right' }}>Additional needed</th><th style={{ textAlign: 'right' }}>Pace / day</th><th>Status</th></tr></thead>
						<tbody>
							{d.collection_milestones.gates.map((g) => (
								<tr key={g.label}>
									<td style={{ fontWeight: 600 }}>{g.label}</td>
									<td className="num" style={{ textAlign: 'right' }}>{g.cumulative_target != null ? EUR(g.cumulative_target) : '—'}</td>
									<td className="num" style={{ textAlign: 'right' }}>{g.additional_needed != null ? EUR(g.additional_needed) : '—'}</td>
									<td className="num" style={{ textAlign: 'right' }}>{g.required_daily_pace != null ? EUR(g.required_daily_pace) : '—'}</td>
									<td><span className="tag" style={{ color: g.status === 'achieved' ? 'var(--pos)' : g.status === 'in_progress' ? 'var(--warn)' : 'var(--fg-muted)' }}>{g.status === 'achieved' ? 'Achieved' : g.status === 'in_progress' ? 'In progress' : 'Not yet'}</span></td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</Section>

			{/* Monthly collections + product breakdown */}
			<div className="grid-2" style={{ gap: 'var(--space-4)' }}>
				<Section title="Monthly collections vs target">
					<div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 180, paddingTop: 20, position: 'relative' }}>
						{d.collections_breakdown.monthly.map((m, i) => {
							const h = m == null ? 0 : (m / maxMonthly) * 150;
							return (
								<div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }} title={m == null ? '' : EUR(m)}>
									<div style={{ width: '70%', height: h, background: m == null ? 'var(--bg-2)' : 'var(--accent)', borderRadius: '3px 3px 0 0', minHeight: m ? 2 : 0 }} />
									<span style={{ fontSize: 9, color: 'var(--fg-muted)' }}>{MONTHS[i]}</span>
								</div>
							);
						})}
						{/* target line */}
						<div style={{ position: 'absolute', left: 0, right: 0, bottom: 24 + (d.collections_breakdown.monthly_target_flat / maxMonthly) * 150, borderTop: '1px dashed var(--warn)' }} title={`Target ${EUR(d.collections_breakdown.monthly_target_flat)}`} />
					</div>
				</Section>
				<Section title="Product breakdown" meta="Client Revenue · actual (YTD)">
					{prodSegs.length === 0 ? <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>No revenue yet.</div>
						: <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}><PieDonut segments={prodSegs} size={150} mode="donut" /><div style={{ flex: 1, minWidth: 150 }}><PieLegend segments={prodSegs} /></div></div>}
				</Section>
			</div>

			{/* Daily forecast + drilldown */}
			<Section title="Daily cash forecast" meta={d.daily_cash_forecast.first_negative_date ? `first negative ${d.daily_cash_forecast.first_negative_date} · low ${EUR(d.daily_cash_forecast.lowest_point.balance)}` : `low ${EUR(d.daily_cash_forecast.lowest_point.balance)} @ ${d.daily_cash_forecast.lowest_point.date}`}>
				<ForecastChart series={d.daily_cash_forecast.series} onPick={setDrill} />
				{drill && (
					<div className="card" style={{ marginTop: 10, padding: 'var(--space-3)' }}>
						<div style={{ fontWeight: 600, fontSize: 12, marginBottom: 6 }}>{drill}</div>
						{(d.daily_cash_forecast.transactions_by_date[drill] ?? []).length === 0 ? <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>No transactions logged.</div>
							: (d.daily_cash_forecast.transactions_by_date[drill]).map((t, i) => (
								<div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}><span>{t.description || '—'}</span><span className="num" style={{ color: t.amount < 0 ? 'var(--neg)' : 'var(--pos)' }}>{EUR(t.amount)}</span></div>
							))}
					</div>
				)}
			</Section>

			{/* Upcoming */}
			<div className="grid-2" style={{ gap: 'var(--space-4)' }}>
				<MoveTable title="Next incoming" rows={d.upcoming_cash_movements.next_incoming} />
				<MoveTable title="Next outgoing" rows={d.upcoming_cash_movements.next_outgoing} />
			</div>
			<Section title="Largest commitments — next 30 days">
				<div className="table-scroll"><table className="data-table"><thead><tr><th>Due</th><th>Description</th><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
					<tbody>{d.upcoming_cash_movements.largest_commitments_30d.map((m, i) => <tr key={i}><td>{fmtDate(m.date)}</td><td>{m.description || '—'}</td><td>{m.category ?? '—'}</td><td className="num" style={{ textAlign: 'right', color: m.amount < 0 ? 'var(--neg)' : 'var(--pos)' }}>{EUR(m.amount)}</td></tr>)}
						{d.upcoming_cash_movements.largest_commitments_30d.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--fg-muted)' }}>None.</td></tr>}</tbody></table></div>
			</Section>

			{/* Risks */}
			<div className="grid-2" style={{ gap: 'var(--space-4)' }}>
				<Section title="Largest forecast outflows">
					<div className="table-scroll"><table className="data-table"><thead><tr><th>Date</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
						<tbody>{d.cash_risks.largest_forecast_outflows.map((m, i) => <tr key={i}><td>{fmtDate(m.date)}</td><td>{m.description || '—'}</td><td className="num" style={{ textAlign: 'right', color: 'var(--neg)' }}>{EUR(m.amount)}</td></tr>)}
							{d.cash_risks.largest_forecast_outflows.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--fg-muted)' }}>None.</td></tr>}</tbody></table></div>
				</Section>
				<Section title="Overdue customer payments">
					<div className="table-scroll"><table className="data-table"><thead><tr><th>Due</th><th>Customer</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
						<tbody>{d.cash_risks.overdue_customer_payments.map((m, i) => <tr key={i}><td>{fmtDate(m.due_date)} · {m.days_overdue}d</td><td>{m.counterparty ?? m.description}</td><td className="num" style={{ textAlign: 'right', color: 'var(--pos)' }}>{EUR(m.amount)}</td></tr>)}
							{d.cash_risks.overdue_customer_payments.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--fg-muted)' }}>None overdue.</td></tr>}</tbody></table></div>
				</Section>
			</div>

			<Section title="Notes & assumptions">
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', fontSize: 12 }}>
					<Note label="Full-year income booked" v={d.notes.full_year_income_booked} />
					<Note label="Full-year expenses booked" v={d.notes.full_year_expenses_booked} />
					<Note label="Full-year P&L gap" v={d.notes.full_year_pl_gap} />
					<Note label="Opening cash buffer" v={d.notes.opening_cash_buffer} />
					<Note label="Cash position gap" v={d.notes.cash_position_gap} />
					<Note label="Gap to €350k stretch" v={d.notes.stretch_gap_to_350k} />
				</div>
			</Section>
		</>
	);
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
	return (
		<div className="card" style={{ padding: 'var(--space-4)', borderTop: tone ? `2px solid ${tone}` : undefined }}>
			<div className="co-stat-label">{label}</div>
			<div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 4, color: tone === 'var(--neg)' ? 'var(--neg)' : 'var(--fg)' }}>{value}</div>
			{sub && <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{sub}</div>}
		</div>
	);
}
function Note({ label, v }: { label: string; v: number | undefined }) {
	return <div className="card" style={{ padding: 'var(--space-3)' }}><div className="co-stat-label">{label}</div><div className="num" style={{ fontWeight: 700, marginTop: 2 }}>{EUR(v ?? 0)}</div></div>;
}
function MoveTable({ title, rows }: { title: string; rows: Move[] }) {
	return (
		<Section title={title}>
			<div className="table-scroll"><table className="data-table"><thead><tr><th>Due</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
				<tbody>{rows.map((m, i) => <tr key={i}><td>{fmtDate(m.date)}</td><td>{m.description || '—'}</td><td className="num" style={{ textAlign: 'right', color: m.amount < 0 ? 'var(--neg)' : 'var(--pos)' }}>{EUR(m.amount)}</td></tr>)}
					{rows.length === 0 && <tr><td colSpan={3} style={{ color: 'var(--fg-muted)' }}>None.</td></tr>}</tbody></table></div>
		</Section>
	);
}

// Minimal inline forecast line chart (the admin has no line-chart primitive).
function ForecastChart({ series, onPick }: { series: Array<{ date: string; balance: number }>; onPick: (d: string) => void }) {
	const ref = useRef<SVGSVGElement | null>(null);
	const [hover, setHover] = useState<number | null>(null);
	if (series.length === 0) return <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>No forecast data.</div>;
	const W = 960, H = 220, PAD = 8;
	const vals = series.map((s) => s.balance);
	const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
	const x = (i: number) => PAD + (i / Math.max(1, series.length - 1)) * (W - 2 * PAD);
	const y = (v: number) => PAD + (1 - (v - min) / (max - min || 1)) * (H - 2 * PAD);
	const path = series.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s.balance).toFixed(1)}`).join(' ');
	const zeroY = y(0);
	const onMove = (e: React.MouseEvent) => {
		const r = ref.current?.getBoundingClientRect(); if (!r) return;
		const px = ((e.clientX - r.left) / r.width) * W;
		const i = Math.round(((px - PAD) / (W - 2 * PAD)) * (series.length - 1));
		setHover(Math.max(0, Math.min(series.length - 1, i)));
	};
	return (
		<div style={{ position: 'relative' }}>
			<svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', cursor: 'crosshair' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={() => hover != null && onPick(series[hover].date)}>
				<line x1={PAD} x2={W - PAD} y1={zeroY} y2={zeroY} stroke="var(--neg)" strokeDasharray="3 3" opacity={0.6} />
				<path d={path} fill="none" stroke="var(--accent)" strokeWidth={1.8} />
				{hover != null && <><line x1={x(hover)} x2={x(hover)} y1={PAD} y2={H - PAD} stroke="var(--border)" /><circle cx={x(hover)} cy={y(series[hover].balance)} r={3.5} fill="var(--accent)" /></>}
			</svg>
			{hover != null && (
				<div className="pie-tip" style={{ left: `${(x(hover) / W) * 100}%`, top: 4 }}>
					<div className="pie-tip-l">{series[hover].date}</div>
					<div className="pie-tip-v">{EUR(series[hover].balance)}</div>
				</div>
			)}
			<div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>Click a point to see that day’s transactions.</div>
		</div>
	);
}
