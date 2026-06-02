'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader, AsyncState } from '@/components/atoms';

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

	return (
		<div>
			<PageHeader kicker={`Operations · last ${range}`} title="Performance" subtitle="Background job throughput and latency, refreshed every 30s." />

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				{RANGES.map((r) => (
					<button key={r} className={`chip ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>{r}</button>
				))}
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
