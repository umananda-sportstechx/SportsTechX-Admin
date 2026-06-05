'use client';

import { Fragment, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader, AsyncState, StatCard, Section } from '@/components/atoms';
import { Funnel } from '@/components/charts';
import { StatStrip } from '@/components/filters';

type DcrStatus = 'open' | 'picked_up' | 'resolved' | 'rejected';
interface QueueStats { data_requests: Array<{ label: string; value: number }> }

interface Dcr {
	id: string;
	entity_type: string | null;
	entity_id: string | null;
	target_name_snapshot: string | null;
	field_change: string | null;
	old_value: string | null;
	requested_value: string | null;
	change_type: string | null;
	user_email: string | null;
	resolution_notes: string | null;
	context: Record<string, unknown> | null;
	status: DcrStatus;
	created_at: string;
}
const APPLYABLE = new Set(['company', 'investor', 'deal', 'ecosystem']);
interface DcrResponse { data: Dcr[]; total: number; totalPages: number }

const TABS: Array<{ label: string; key: DcrStatus }> = [
	{ label: 'Open', key: 'open' },
	{ label: 'Picked up', key: 'picked_up' },
	{ label: 'Resolved', key: 'resolved' },
	{ label: 'Rejected', key: 'rejected' },
];

export default function DataRequestsPage() {
	const { mutate } = useSWRConfig();
	const [status, setStatus] = useState<DcrStatus>('open');
	const [page, setPage] = useState(1);
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());

	const { data, error, isLoading } = useSWR<DcrResponse>(
		['/api/admin/data-change-requests', { status, page, limit: 30 }],
		{ dedupingInterval: 15_000 },
	);
	const stats = useSWR<QueueStats>(['/api/admin/stats/queues'], { dedupingInterval: 60_000 });
	const dq: Record<string, number> = Object.fromEntries((stats.data?.data_requests ?? []).map((b) => [b.label, b.value]));

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/admin/data-change-requests');

	const update = async (id: string, next: DcrStatus, notes?: string) => {
		setPendingId(id);
		try {
			await api('POST', `/api/admin/data-change-requests/${id}/status`, { status: next, ...(notes !== undefined ? { notes } : {}) });
			toast.success('Updated');
			void mutate((key) => Array.isArray(key) && key[0] === '/api/admin/data-change-requests');
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setPendingId(null);
		}
	};

	const resolveWithNotes = (id: string, next: 'resolved' | 'rejected') => {
		const notes = window.prompt(next === 'rejected' ? 'Reason for rejection (optional):' : 'Resolution notes (optional):') ?? undefined;
		if (notes === undefined) return; // cancelled
		void update(id, next, notes);
	};

	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [editVal, setEditVal] = useState('');
	const [applyPending, setApplyPending] = useState<string | null>(null);
	const toggleExpand = (r: Dcr) => {
		if (expandedId === r.id) { setExpandedId(null); return; }
		setExpandedId(r.id);
		setEditVal(r.requested_value ?? '');
	};
	const applyChange = async (r: Dcr) => {
		setApplyPending(r.id);
		try {
			await api('POST', `/api/admin/data-change-requests/${r.id}/apply`, { value: editVal, field: r.field_change ?? undefined });
			toast.success('Applied to the record');
			setExpandedId(null);
			void refresh();
		} catch (e) { toast.error((e as Error).message); }
		finally { setApplyPending(null); }
	};

	const toggleSel = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
	const batch = async (label: string, fn: (id: string) => Promise<unknown>) => {
		let ok = 0, fail = 0;
		for (const id of [...selected]) { try { await fn(id); ok++; } catch { fail++; } }
		if (fail) toast.error(`${label}: ${ok} succeeded, ${fail} failed`); else toast.success(`${label}: ${ok}`);
		setSelected(new Set());
		void refresh();
	};
	// Batch apply uses each row's submitted value as-is (apply-as-submitted).
	const batchApply = () => batch('Applied', (id) => api('POST', `/api/admin/data-change-requests/${id}/apply`, {}));
	const batchReject = () => batch('Rejected', (id) => api('POST', `/api/admin/data-change-requests/${id}/status`, { status: 'rejected' }));

	const items = data?.data ?? [];
	const allSelected = items.length > 0 && items.every((r) => selected.has(r.id));
	const toggleAll = () => setSelected(allSelected ? new Set() : new Set(items.map((r) => r.id)));
	return (
		<div>
			<PageHeader kicker={`Queues · ${(data?.total ?? 0).toLocaleString()} in ${status}`} title="Data change requests" />

			<StatStrip cols={4}>
				<StatCard label="Open" loading={stats.isLoading} value={(dq.open ?? 0).toLocaleString()} urgent={(dq.open ?? 0) > 0} />
				<StatCard label="Picked up" loading={stats.isLoading} value={(dq.picked_up ?? 0).toLocaleString()} />
				<StatCard label="Resolved" loading={stats.isLoading} value={(dq.resolved ?? 0).toLocaleString()} />
				<StatCard label="Rejected" loading={stats.isLoading} value={(dq.rejected ?? 0).toLocaleString()} />
			</StatStrip>

			<Section title="Request funnel" meta="open → resolved">
				<Funnel stages={[
					{ label: 'Open', value: dq.open ?? 0 },
					{ label: 'Picked up', value: dq.picked_up ?? 0 },
					{ label: 'Resolved', value: dq.resolved ?? 0, color: 'var(--pos)' },
					{ label: 'Rejected', value: dq.rejected ?? 0, color: 'var(--neg)' },
				]} />
			</Section>

			<div style={{ height: 'var(--space-4)' }} />

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				{TABS.map((t) => (
					<button key={t.key} className={`chip ${status === t.key ? 'on' : ''}`} onClick={() => { setStatus(t.key); setPage(1); }}>
						{t.label}
					</button>
				))}
			</div>

			{selected.size > 0 && (
				<div className="card" style={{ padding: 12, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
					<strong>{selected.size} selected</strong>
					<button className="btn" onClick={() => void batchApply()}>Apply selected (as submitted)</button>
					<button className="btn ghost" onClick={() => void batchReject()}>Reject selected</button>
					<div style={{ flex: 1 }} />
					<button className="btn ghost" onClick={() => setSelected(new Set())}>Clear</button>
				</div>
			)}

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={items.length === 0} emptyMsg={`Nothing in ${status}.`} onRetry={() => void refresh()}>
				<table className="data-table">
					<thead>
						<tr>
							<th style={{ width: 28 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" /></th>
							<th>Created</th>
							<th>Target</th>
							<th>Requested change</th>
							<th>Requester</th>
							<th>Status</th>
							<th style={{ textAlign: 'right' }}>Actions</th>
						</tr>
					</thead>
					<tbody>
						{items.map((r) => (
							<Fragment key={r.id}>
							<tr>
								<td><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSel(r.id)} aria-label="Select row" /></td>
								<td className="num">{new Date(r.created_at).toLocaleDateString()}</td>
								<td>
									<button className="btn ghost" style={{ padding: '2px 4px', marginRight: 4 }} onClick={() => toggleExpand(r)} aria-label="Toggle details">
										{expandedId === r.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
									</button>
									<span style={{ fontWeight: 600 }}>{r.target_name_snapshot ?? '—'}</span>
									<div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{r.entity_type ?? ''}</div>
								</td>
								<td style={{ maxWidth: 320 }}>
									{r.field_change ? (
										<div style={{ fontSize: 13 }}>
											<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>{r.change_type ?? 'edit'} · {r.field_change}</span>
											<div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
												<span style={{ color: 'var(--fg-muted)', textDecoration: 'line-through' }}>{r.old_value || '∅'}</span>
												{' → '}
												<span style={{ fontWeight: 600 }}>{r.requested_value || '∅'}</span>
											</div>
										</div>
									) : '—'}
									{r.resolution_notes && <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>note: {r.resolution_notes}</div>}
								</td>
								<td style={{ fontSize: 12 }}>{r.user_email ?? '—'}</td>
								<td><span className="tag">{r.status}</span></td>
								<td style={{ textAlign: 'right' }}>
									<div style={{ display: 'inline-flex', gap: 6 }}>
										{r.status !== 'picked_up' && r.status !== 'resolved' && (
											<button className="btn ghost" disabled={pendingId === r.id} onClick={() => void update(r.id, 'picked_up')}>Pick up</button>
										)}
										{r.status !== 'resolved' && (
											<button className="btn" disabled={pendingId === r.id} onClick={() => resolveWithNotes(r.id, 'resolved')}>Resolve</button>
										)}
										{r.status !== 'rejected' && (
											<button className="btn ghost" disabled={pendingId === r.id} onClick={() => resolveWithNotes(r.id, 'rejected')}>Reject</button>
										)}
										{r.status !== 'open' && (
											<button className="btn ghost" disabled={pendingId === r.id} onClick={() => void update(r.id, 'open')}>Re-open</button>
										)}
									</div>
								</td>
							</tr>
							{expandedId === r.id && (
								<tr>
									<td colSpan={7} style={{ background: 'var(--bg-2)' }}>
										<div style={{ display: 'grid', gap: 10, padding: '4px 4px 10px' }}>
											<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, fontSize: 12 }}>
												<div><div className="co-stat-label">Entity</div>{r.entity_type ?? '—'}</div>
												<div><div className="co-stat-label">Field</div>{r.field_change ?? '—'}</div>
												<div><div className="co-stat-label">Change type</div>{r.change_type ?? 'edit'}</div>
												<div><div className="co-stat-label">Current value</div><span style={{ color: 'var(--fg-muted)' }}>{r.old_value || '∅'}</span></div>
												<div><div className="co-stat-label">Requested by</div>{r.user_email ?? '—'}</div>
												<div><div className="co-stat-label">Submitted</div>{new Date(r.created_at).toLocaleString()}</div>
											</div>
											{r.context && Object.keys(r.context).length > 0 && (
												<div style={{ fontSize: 12 }}>
													<div className="co-stat-label">Extra context</div>
													<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' }}>{JSON.stringify(r.context, null, 2)}</pre>
												</div>
											)}
											{APPLYABLE.has(r.entity_type ?? '') ? (
												<div style={{ display: 'grid', gap: 6 }}>
													<div className="co-stat-label">Value to apply (edit before applying if needed)</div>
													<div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
														<textarea className="search-input" style={{ flex: 1, minHeight: 38, resize: 'vertical' }} value={editVal} onChange={(e) => setEditVal(e.target.value)} />
														<button className="btn" disabled={applyPending === r.id || r.status === 'resolved'} onClick={() => void applyChange(r)}>
															{applyPending === r.id ? 'Applying…' : 'Apply to record'}
														</button>
													</div>
													<div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Writes <code>{r.field_change ?? '—'}</code> on the {r.entity_type} and marks this request resolved.</div>
												</div>
											) : (
												<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>This request type can’t be auto-applied — review and resolve manually.</div>
											)}
										</div>
									</td>
								</tr>
							)}
							</Fragment>
						))}
					</tbody>
				</table>
				</AsyncState>
			</div>
		</div>
	);
}
