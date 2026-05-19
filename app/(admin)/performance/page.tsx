'use client';

import { useState } from 'react';
import useSWR from 'swr';

interface JobMetric { queue_name: string; status: string; count: number; avg_duration_seconds: number | null }
interface RequestMetric { bucket: string; count: number }
interface PerfResponse { jobs: JobMetric[]; requests: RequestMetric[]; range: string }

const RANGES: Array<'1h' | '24h' | '7d' | '30d'> = ['1h', '24h', '7d', '30d'];

export default function PerformancePage() {
	const [range, setRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
	const { data } = useSWR<PerfResponse>(
		['/api/admin/performance', { range }],
		{ dedupingInterval: 15_000, refreshInterval: 30_000 },
	);

	const jobs = data?.jobs ?? [];
	const requests = data?.requests ?? [];

	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
					Operations · last {range}
				</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>Performance</h1>
			</div>

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				{RANGES.map((r) => (
					<button key={r} className={`chip ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>{r}</button>
				))}
			</div>

			<div className="grid-2">
				<div className="card">
					<div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Job queues</div>
					{jobs.length === 0 ? (
						<div style={{ padding: 'var(--space-4)', color: 'var(--fg-muted)' }}>No data</div>
					) : (
						<table className="data-table">
							<thead><tr><th>Queue</th><th>Status</th><th>Count</th><th>Avg duration</th></tr></thead>
							<tbody>
								{jobs.map((j, i) => (
									<tr key={`${j.queue_name}-${j.status}-${i}`}>
										<td>{j.queue_name}</td>
										<td>
											<span className={`tag ${j.status === 'failed' ? 'neg' : j.status === 'completed' ? 'pos' : ''}`}>
												{j.status}
											</span>
										</td>
										<td className="num">{j.count}</td>
										<td className="num">{j.avg_duration_seconds != null ? `${j.avg_duration_seconds.toFixed(1)}s` : '—'}</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>

				<div className="card">
					<div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>HTTP requests</div>
					{requests.length === 0 ? (
						<div style={{ padding: 'var(--space-4)', color: 'var(--fg-muted)' }}>No request_logs table yet</div>
					) : (
						<table className="data-table">
							<thead><tr><th>Status</th><th>Count</th></tr></thead>
							<tbody>
								{requests.map((r) => (
									<tr key={r.bucket}>
										<td>{r.bucket}</td>
										<td className="num">{r.count.toLocaleString()}</td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			</div>
		</div>
	);
}
