'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader, StatCard, AsyncState } from '@/components/atoms';
import { HBarDrilldown, type HBarRow } from '@/components/charts';

const QUEUE_COLORS = ['#79CABD', '#6CA8FF', '#FFB36C', '#D99CFF', '#FF9CA8', '#9CE0C0', '#C0F4DE'];

interface SummaryRow {
	metric_type: string;
	total_requests: string;
	avg_duration_ms: string;
	p95_duration_ms: string;
	max_duration_ms: number;
	success_count: string;
	error_count: string;
}
interface SlowestRow {
	metric_type: string;
	queue_name: string;
	entity_type: string | null;
	entity_id: string | null;
	duration_ms: number;
	completed_at: string;
}
interface PerfResponse { summary: SummaryRow[]; slowest: SlowestRow[]; range: string }

const RANGES = ['1h', '6h', '24h', '7d', '30d'] as const;
type Range = (typeof RANGES)[number];

function ms(v: string | number | null): string {
	const n = typeof v === 'string' ? Number(v) : v;
	if (n == null || Number.isNaN(n)) return '—';
	if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
	return `${Math.round(n)}ms`;
}

export default function PerformancePage() {
	const [range, setRange] = useState<Range>('24h');
	const { data, error, isLoading, mutate } = useSWR<PerfResponse>(
		['/api/admin/performance', { range }],
		{ dedupingInterval: 15_000, refreshInterval: 30_000 },
	);

	const summary = data?.summary ?? [];
	const slowest = data?.slowest ?? [];

	// Aggregate across queues for the headline stat cards.
	const totalReq = summary.reduce((s, r) => s + Number(r.total_requests), 0);
	const totalSucc = summary.reduce((s, r) => s + Number(r.success_count), 0);
	const totalErr = summary.reduce((s, r) => s + Number(r.error_count), 0);
	const successRate = totalSucc + totalErr > 0 ? (totalSucc / (totalSucc + totalErr)) * 100 : 0;
	const weightedAvg = totalReq > 0 ? summary.reduce((s, r) => s + Number(r.avg_duration_ms) * Number(r.total_requests), 0) / totalReq : 0;
	const maxP95 = summary.reduce((m, r) => Math.max(m, Number(r.p95_duration_ms)), 0);

	const reqRows: HBarRow[] = summary.map((s, i) => ({
		id: s.metric_type, label: s.metric_type, value: Number(s.total_requests),
		formatted: Number(s.total_requests).toLocaleString(), color: QUEUE_COLORS[i % QUEUE_COLORS.length],
	}));
	const p95Rows: HBarRow[] = [...summary]
		.sort((a, b) => Number(b.p95_duration_ms) - Number(a.p95_duration_ms))
		.map((s, i) => ({
			id: s.metric_type, label: s.metric_type, value: Number(s.p95_duration_ms),
			formatted: ms(s.p95_duration_ms), color: QUEUE_COLORS[i % QUEUE_COLORS.length],
		}));

	return (
		<div>
			<PageHeader kicker={`Operations · last ${range}`} title="Performance" subtitle="Background job throughput and latency, refreshed every 30s." />

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				{RANGES.map((r) => (
					<button key={r} className={`chip ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>{r}</button>
				))}
			</div>

			<div className="grid-4" style={{ marginBottom: 'var(--space-5)' }}>
				<StatCard label="Total jobs" loading={isLoading} value={totalReq.toLocaleString()} />
				<StatCard label="Success rate" loading={isLoading} value={`${successRate.toFixed(1)}%`} urgent={successRate < 95 && totalReq > 0} />
				<StatCard label="Avg latency" loading={isLoading} value={ms(weightedAvg)} />
				<StatCard label="Worst p95" loading={isLoading} value={ms(maxP95)} />
			</div>

			<div className="grid-2" style={{ marginBottom: 'var(--space-5)' }}>
				<div className="card">
					<div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Throughput by queue</div>
					<div style={{ padding: 'var(--space-4)' }}>
						<AsyncState loading={isLoading} error={error} empty={reqRows.length === 0} emptyMsg="No jobs in this range" onRetry={() => void mutate()}>
							<HBarDrilldown rows={reqRows} />
						</AsyncState>
					</div>
				</div>
				<div className="card">
					<div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>p95 latency by queue</div>
					<div style={{ padding: 'var(--space-4)' }}>
						<AsyncState loading={isLoading} error={error} empty={p95Rows.length === 0} emptyMsg="No jobs in this range" onRetry={() => void mutate()}>
							<HBarDrilldown rows={p95Rows} />
						</AsyncState>
					</div>
				</div>
			</div>

			<div className="card" style={{ marginBottom: 'var(--space-4)' }}>
				<div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Job queues</div>
				<AsyncState loading={isLoading} error={error} empty={summary.length === 0} emptyMsg="No jobs in this range" onRetry={() => void mutate()}>
					<table className="data-table">
						<thead><tr><th>Queue</th><th>Total</th><th>Succeeded</th><th>Errored</th><th>Avg</th><th>p95</th><th>Max</th></tr></thead>
						<tbody>
							{summary.map((s) => {
								const errors = Number(s.error_count);
								return (
									<tr key={s.metric_type}>
										<td>{s.metric_type}</td>
										<td className="num">{Number(s.total_requests).toLocaleString()}</td>
										<td className="num"><span className="tag pos">{Number(s.success_count).toLocaleString()}</span></td>
										<td className="num">{errors > 0 ? <span className="tag neg">{errors.toLocaleString()}</span> : '—'}</td>
										<td className="num">{ms(s.avg_duration_ms)}</td>
										<td className="num">{ms(s.p95_duration_ms)}</td>
										<td className="num">{ms(s.max_duration_ms)}</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</AsyncState>
			</div>

			<div className="card">
				<div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Slowest jobs</div>
				<AsyncState loading={isLoading} error={error} empty={slowest.length === 0} emptyMsg="No completed jobs in this range" onRetry={() => void mutate()}>
					<table className="data-table">
						<thead><tr><th>Queue</th><th>Entity</th><th>Duration</th><th>Completed</th></tr></thead>
						<tbody>
							{slowest.map((r, i) => (
								<tr key={`${r.queue_name}-${i}`}>
									<td>{r.queue_name}</td>
									<td>{r.entity_type ? `${r.entity_type}${r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ''}` : '—'}</td>
									<td className="num">{ms(r.duration_ms)}</td>
									<td>{r.completed_at ? new Date(r.completed_at).toLocaleString() : '—'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</AsyncState>
			</div>
		</div>
	);
}
