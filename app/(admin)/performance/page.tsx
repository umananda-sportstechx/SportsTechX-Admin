'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ExternalLink } from 'lucide-react';
import { Modal } from '@/components/modal';
import { PageHeader, StatCard, AsyncState, Section } from '@/components/atoms';
import { HBarDrilldown, ComboBarLine, type HBarRow } from '@/components/charts';

const QUEUE_COLORS = ['#79CABD', '#6CA8FF', '#FFB36C', '#D99CFF', '#FF9CA8', '#9CE0C0', '#C0F4DE'];

// ── HTTP request metrics ──
interface HttpSummary { total: number; avg_ms: number; p95_ms: number; max_ms: number; errors: number }
interface ByRoute { route: string; method: string; total: number; avg_ms: number; p95_ms: number; max_ms: number; errors: number }
interface HttpResponse { summary: HttpSummary; byRoute: ByRoute[]; timeline: Array<{ label: string; total: number; errors: number }>; range: string }
interface ErrorRow { method: string; route: string; status_code: number; error_message: string | null; created_at: string }

// ── Background job metrics (existing) ──
interface SummaryRow { metric_type: string; total_requests: string; avg_duration_ms: string; p95_duration_ms: string; max_duration_ms: number; success_count: string; error_count: string }
interface SlowestRow { metric_type: string; queue_name: string; entity_type: string | null; entity_id: string | null; duration_ms: number; completed_at: string }
interface PerfResponse { summary: SummaryRow[]; slowest: SlowestRow[]; range: string }

const RANGES = ['1h', '6h', '24h', '7d', '30d'] as const;
type Range = (typeof RANGES)[number];
const OBSERVABILITY_URL = 'https://supabase.com/dashboard/project/lipxxbmiusdluagossxa/advisors/performance';

function ms(v: string | number | null): string {
	const n = typeof v === 'string' ? Number(v) : v;
	if (n == null || Number.isNaN(n)) return '—';
	if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
	return `${Math.round(n)}ms`;
}
// Latency benchmark coloring (generic HTTP targets).
function latColor(n: number, warn: number, crit: number): string | undefined {
	if (n >= crit) return 'var(--neg)';
	if (n >= warn) return 'var(--warn)';
	return 'var(--pos)';
}

export default function PerformancePage() {
	const [range, setRange] = useState<Range>('24h');
	const [errRoute, setErrRoute] = useState<string | 'all' | null>(null);

	const http = useSWR<HttpResponse>(['/api/admin/performance/http', { range }], { dedupingInterval: 15_000, refreshInterval: 30_000 });
	const { data, error, isLoading, mutate } = useSWR<PerfResponse>(['/api/admin/performance', { range }], { dedupingInterval: 15_000, refreshInterval: 30_000 });

	const h = http.data?.summary;
	const httpErrRate = h && h.total > 0 ? (h.errors / h.total) * 100 : 0;
	const timelineChart = (http.data?.timeline ?? []).map((t) => ({ label: t.label, amt: t.total, deals: t.errors }));

	const summary = data?.summary ?? [];
	const slowest = data?.slowest ?? [];
	const totalReq = summary.reduce((s, r) => s + Number(r.total_requests), 0);
	const totalSucc = summary.reduce((s, r) => s + Number(r.success_count), 0);
	const totalErr = summary.reduce((s, r) => s + Number(r.error_count), 0);
	const successRate = totalSucc + totalErr > 0 ? (totalSucc / (totalSucc + totalErr)) * 100 : 0;
	const weightedAvg = totalReq > 0 ? summary.reduce((s, r) => s + Number(r.avg_duration_ms) * Number(r.total_requests), 0) / totalReq : 0;
	const maxP95 = summary.reduce((m, r) => Math.max(m, Number(r.p95_duration_ms)), 0);

	const reqRows: HBarRow[] = summary.map((s, i) => ({ id: s.metric_type, label: s.metric_type, value: Number(s.total_requests), formatted: Number(s.total_requests).toLocaleString(), color: QUEUE_COLORS[i % QUEUE_COLORS.length] }));
	const p95Rows: HBarRow[] = [...summary].sort((a, b) => Number(b.p95_duration_ms) - Number(a.p95_duration_ms)).map((s, i) => ({ id: s.metric_type, label: s.metric_type, value: Number(s.p95_duration_ms), formatted: ms(s.p95_duration_ms), color: QUEUE_COLORS[i % QUEUE_COLORS.length] }));

	return (
		<div>
			<PageHeader kicker={`Operations · last ${range}`} title="Performance" subtitle="HTTP endpoint latency + background job throughput, refreshed every 30s." />

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				{RANGES.map((r) => (<button key={r} className={`chip ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>{r}</button>))}
				<div style={{ flex: 1 }} />
				<a className="btn ghost" href={OBSERVABILITY_URL} target="_blank" rel="noopener noreferrer"><ExternalLink size={12} /> Supabase observability</a>
			</div>

			{/* ── HTTP requests ── */}
			<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>HTTP requests</div>
			<div className="grid-4" style={{ marginBottom: 'var(--space-4)' }}>
				<StatCard label="Total requests" loading={http.isLoading} value={(h?.total ?? 0).toLocaleString()} />
				<StatCard label="Error rate (5xx)" loading={http.isLoading} value={`${httpErrRate.toFixed(2)}%`} urgent={httpErrRate > 1} />
				<StatCard label="Avg latency" loading={http.isLoading} value={ms(h?.avg_ms ?? 0)} />
				<StatCard label="p95 latency" loading={http.isLoading} value={ms(h?.p95_ms ?? 0)} />
			</div>

			<Section title="Request volume & errors" meta={`bars = requests · line = 5xx · last ${range}`}>
				<AsyncState loading={http.isLoading} error={http.error} empty={timelineChart.length === 0} emptyMsg="No requests recorded yet (instrumentation just deployed)." onRetry={() => void http.mutate()}>
					<ComboBarLine data={timelineChart} height={220} valueFormatter={(v) => String(Math.round(v))} barLabel="Requests" lineLabel="errors" />
				</AsyncState>
			</Section>

			<div className="card" style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
					<span>Endpoints <span style={{ fontWeight: 400, color: 'var(--fg-muted)', fontSize: 12 }}>· by traffic · green/amber/red = latency health</span></span>
					{(h?.errors ?? 0) > 0 && <button className="btn ghost" onClick={() => setErrRoute('all')}>View {h!.errors} errors</button>}
				</div>
				<AsyncState loading={http.isLoading} error={http.error} empty={(http.data?.byRoute.length ?? 0) === 0} emptyMsg="No requests in this range." onRetry={() => void http.mutate()}>
					<table className="data-table">
						<thead><tr><th>Method</th><th>Route</th><th>Requests</th><th>Avg</th><th>p95</th><th>Max</th><th>Errors</th></tr></thead>
						<tbody>
							{(http.data?.byRoute ?? []).map((r) => (
								<tr key={`${r.method}-${r.route}`}>
									<td><span className="tag">{r.method}</span></td>
									<td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.route}</td>
									<td className="num">{r.total.toLocaleString()}</td>
									<td className="num" style={{ color: latColor(r.avg_ms, 300, 800) }}>{ms(r.avg_ms)}</td>
									<td className="num" style={{ color: latColor(r.p95_ms, 800, 2000) }}>{ms(r.p95_ms)}</td>
									<td className="num">{ms(r.max_ms)}</td>
									<td className="num">{r.errors > 0 ? <button className="tag neg" style={{ border: 'none', cursor: 'pointer' }} onClick={() => setErrRoute(r.route)}>{r.errors}</button> : '—'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</AsyncState>
			</div>

			{errRoute && <ErrorsModal range={range} route={errRoute === 'all' ? undefined : errRoute} onClose={() => setErrRoute(null)} />}

			{/* ── Background jobs ── */}
			<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>Background jobs</div>
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
						<AsyncState loading={isLoading} error={error} empty={reqRows.length === 0} emptyMsg="No jobs in this range" onRetry={() => void mutate()}><HBarDrilldown rows={reqRows} /></AsyncState>
					</div>
				</div>
				<div className="card">
					<div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>p95 latency by queue</div>
					<div style={{ padding: 'var(--space-4)' }}>
						<AsyncState loading={isLoading} error={error} empty={p95Rows.length === 0} emptyMsg="No jobs in this range" onRetry={() => void mutate()}><HBarDrilldown rows={p95Rows} /></AsyncState>
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

function ErrorsModal({ range, route, onClose }: { range: string; route?: string; onClose: () => void }) {
	const { data, isLoading } = useSWR<{ errors: ErrorRow[] }>(
		['/api/admin/performance/http/errors', { range, route }],
		{ dedupingInterval: 10_000 },
	);
	const errors = data?.errors ?? [];
	return (
		<Modal title={route ? `5xx errors · ${route}` : '5xx errors'} onClose={onClose} width={680} footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
			<AsyncState loading={isLoading} empty={errors.length === 0} emptyMsg="No 5xx errors in this range.">
				<table className="data-table">
					<thead><tr><th>When</th><th>Method</th><th>Route</th><th>Status</th><th>Message</th></tr></thead>
					<tbody>
						{errors.map((e, i) => (
							<tr key={i}>
								<td className="num">{new Date(e.created_at).toLocaleString()}</td>
								<td>{e.method}</td>
								<td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{e.route}</td>
								<td className="num"><span className="tag neg">{e.status_code}</span></td>
								<td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={e.error_message ?? ''}>{e.error_message ?? '—'}</td>
							</tr>
						))}
					</tbody>
				</table>
			</AsyncState>
		</Modal>
	);
}
