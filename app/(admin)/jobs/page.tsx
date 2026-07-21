'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { InvestorSelectOne } from '@/components/entity-pickers';
import { PageHeader, Section, StatCard, AsyncState, Tag } from '@/components/atoms';
import { StatStrip } from '@/components/filters';

interface JobRow {
	id: string; queue_name: string; job_name: string | null; status: string;
	attempt: number; max_attempts: number;
	enqueued_at: string | null; started_at: string | null; completed_at: string | null;
	entity_type: string | null; entity_id: string | null;
	last_error: string | null; created_at: string; duration_s: number | null;
}
interface QueueRow {
	queue_name: string; total: number; completed: number; failed: number;
	open: number; last_run: string | null; avg_s: number | null;
}
interface HistoryResp {
	rows: JobRow[];
	by_status: Array<{ status: string; count: number }>;
	by_queue: QueueRow[];
}

const STATUS_TONE: Record<string, '' | 'pos' | 'neg' | 'warn'> = {
	completed: 'pos', failed: 'neg', stuck: 'neg', pending: 'warn', running: '',
};
const secs = (n: number | null): string => {
	if (n == null) return '—';
	if (n < 60) return `${n}s`;
	if (n < 3600) return `${Math.round(n / 60)}m`;
	return `${(n / 3600).toFixed(1)}h`;
};
const when = (v: string | null): string => (v ? new Date(v).toLocaleString() : '—');

type EndpointKey = 'apolloBatch' | 'attioSync' | 'recommendations' | 'apolloEnrich' | 'digestEmail' | 'sweepStuck';

const ENDPOINTS: Array<{ key: EndpointKey; label: string; desc: string; path: string; needsId?: boolean }> = [
	{
		key: 'apolloBatch',
		label: 'Apollo nightly batch',
		desc: 'Kick the Apollo enrichment batch sweep.',
		path: '/api/admin/integrations/apollo/batch',
	},
	{
		key: 'apolloEnrich',
		label: 'Apollo enrich investor',
		desc: 'Manually enrich a single investor — search and pick below.',
		path: '/api/admin/integrations/apollo/enrich',
		needsId: true,
	},
	{
		key: 'attioSync',
		label: 'Attio CRM sync',
		desc: 'Sync companies, investors, deals to Attio CRM now.',
		path: '/api/admin/integrations/attio/sync',
	},
	{
		key: 'recommendations',
		label: 'Recompute recommendations',
		desc: 'Re-score the recommendation engine immediately.',
		path: '/api/admin/jobs/recommendations/score',
	},
	{
		key: 'digestEmail',
		label: 'Send digest emails',
		desc: 'Run the digest-email job now (otherwise daily at 09:00 UTC).',
		path: '/api/admin/jobs/digest-email',
	},
	{
		key: 'sweepStuck',
		label: 'Sweep stuck jobs',
		desc: 'Re-queue jobs stuck past their timeout (otherwise every 5 min).',
		path: '/api/admin/jobs/sweep-stuck',
	},
];

export default function JobsPage() {
	const [enrichId, setEnrichId] = useState('');
	const [runningKey, setRunningKey] = useState<EndpointKey | null>(null);
	const [status, setStatus] = useState<string>('');

	const history = useSWR<HistoryResp>(
		['/api/admin/jobs/history', { status: status || undefined, limit: 100 }],
		{ dedupingInterval: 15_000, refreshInterval: 30_000 },
	);
	const rows = history.data?.rows ?? [];
	const byStatus = history.data?.by_status ?? [];
	const byQueue = history.data?.by_queue ?? [];
	const openCount = byStatus.filter((b) => b.status !== 'completed').reduce((n, b) => n + b.count, 0);
	const total = byStatus.reduce((n, b) => n + b.count, 0);

	const run = async (endpoint: typeof ENDPOINTS[number]) => {
		setRunningKey(endpoint.key);
		try {
			const path = endpoint.needsId ? `${endpoint.path}/${enrichId}` : endpoint.path;
			const res = await api<{ jobLogId: string; bullJobId: string | null }>('POST', path);
			toast.success(`Queued ${endpoint.label}: job ${res.jobLogId.slice(0, 8)}`);
			void history.mutate();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setRunningKey(null);
		}
	};

	return (
		<div>
			<PageHeader
				kicker={`Operations · ${ENDPOINTS.length} manual jobs`}
				title="Jobs & integrations"
				subtitle="Trigger background work on demand, and see what every queue has actually been doing."
			/>

			<StatStrip cols={4}>
				<StatCard label="Job runs recorded" loading={history.isLoading} value={total.toLocaleString()} />
				<StatCard label="Not completed" loading={history.isLoading} value={openCount.toLocaleString()}
					urgent={openCount > 0} sub="pending, running or stuck" />
				<StatCard label="Queues seen" loading={history.isLoading} value={byQueue.length.toLocaleString()} />
				<StatCard label="Last activity" loading={history.isLoading}
					value={rows[0] ? new Date(rows[0].created_at).toLocaleDateString() : '—'} />
			</StatStrip>

			<div className="grid-2">
				{ENDPOINTS.map((e) => (
					<div key={e.key} className="card" style={{ padding: 'var(--space-4)' }}>
						<div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{e.label}</div>
						<div style={{ fontSize: 13, color: 'var(--fg-2)', marginBottom: 14 }}>{e.desc}</div>
						{e.needsId && (
							<div style={{ marginBottom: 10 }}>
								<InvestorSelectOne value={enrichId} onChange={setEnrichId} />
							</div>
						)}
						<button
							className="btn"
							disabled={runningKey === e.key || (e.needsId && !enrichId)}
							onClick={() => void run(e)}
						>
							{runningKey === e.key ? 'Queuing…' : 'Run now'}
						</button>
					</div>
				))}
			</div>

			{/* job_log already recorded every run; the page just never showed it, so
			    jobs sitting pending for weeks were invisible. */}
			<div style={{ marginTop: 'var(--space-5)', marginBottom: 'var(--space-4)' }}>
				<Section title="Queue health" meta="all recorded runs per queue" padded={false}>
					<AsyncState loading={history.isLoading} error={history.error} empty={byQueue.length === 0}
						emptyMsg="No job runs recorded yet." onRetry={() => void history.mutate()}>
						<div className="table-scroll">
							<table className="data-table">
								<thead><tr>
									<th>Queue</th>
									<th style={{ textAlign: 'right' }}>Runs</th>
									<th style={{ textAlign: 'right' }}>Completed</th>
									<th style={{ textAlign: 'right' }}>Open</th>
									<th style={{ textAlign: 'right' }}>Avg time</th>
									<th>Last run</th>
								</tr></thead>
								<tbody>
									{byQueue.map((q) => (
										<tr key={q.queue_name}>
											<td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{q.queue_name}</td>
											<td className="num" style={{ textAlign: 'right' }}>{q.total.toLocaleString()}</td>
											<td className="num" style={{ textAlign: 'right', color: 'var(--pos)' }}>{q.completed.toLocaleString()}</td>
											<td className="num" style={{ textAlign: 'right', color: q.open > 0 ? 'var(--accent)' : 'var(--fg-muted)' }}>
												{q.open > 0 ? q.open.toLocaleString() : '—'}
											</td>
											<td className="num" style={{ textAlign: 'right', color: 'var(--fg-muted)' }}>{secs(q.avg_s == null ? null : Math.round(q.avg_s))}</td>
											<td className="num">{when(q.last_run)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</AsyncState>
				</Section>
			</div>

			<Section title="Recent runs" meta={`latest ${rows.length} · refreshes every 30s`} padded={false}>
				<div style={{ padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
					<span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Status</span>
					<button className={`chip ${status === '' ? 'on' : ''}`} onClick={() => setStatus('')}>All</button>
					{byStatus.map((b) => (
						<button key={b.status} className={`chip ${status === b.status ? 'on' : ''}`} onClick={() => setStatus(b.status)}>
							{b.status}: {b.count}
						</button>
					))}
				</div>
				<AsyncState loading={history.isLoading} error={history.error} empty={rows.length === 0}
					emptyMsg={status ? `No ${status} jobs.` : 'No job runs recorded yet.'} onRetry={() => void history.mutate()}>
					<div className="table-scroll">
						<table className="data-table">
							<thead><tr>
								<th>Queue</th><th>Status</th><th style={{ textAlign: 'right' }}>Attempt</th>
								<th style={{ textAlign: 'right' }}>Duration</th><th>Queued</th><th>Error</th>
							</tr></thead>
							<tbody>
								{rows.map((r) => (
									<tr key={r.id}>
										<td>
											<div style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.queue_name}</div>
											{r.entity_type && (
												<div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
													{r.entity_type}{r.entity_id ? ` · ${r.entity_id.slice(0, 8)}` : ''}
												</div>
											)}
										</td>
										<td><Tag variant={STATUS_TONE[r.status] ?? ''}>{r.status}</Tag></td>
										<td className="num" style={{ textAlign: 'right', color: r.attempt > 1 ? 'var(--warn)' : 'var(--fg-muted)' }}>
											{r.attempt}/{r.max_attempts}
										</td>
										<td className="num" style={{ textAlign: 'right' }}>{secs(r.duration_s)}</td>
										<td className="num" style={{ whiteSpace: 'nowrap' }}>{when(r.created_at)}</td>
										<td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.last_error ? 'var(--neg)' : 'var(--fg-muted)' }}
											title={r.last_error ?? ''}>
											{r.last_error ?? '—'}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</AsyncState>
			</Section>
		</div>
	);
}
