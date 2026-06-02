'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PageHeader, AsyncState } from '@/components/atoms';

type DcrStatus = 'open' | 'picked_up' | 'resolved' | 'rejected';

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
	status: DcrStatus;
	created_at: string;
}
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

	const { data, error, isLoading } = useSWR<DcrResponse>(
		['/api/admin/data-change-requests', { status, page, limit: 30 }],
		{ dedupingInterval: 15_000 },
	);

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

	const items = data?.data ?? [];
	return (
		<div>
			<PageHeader kicker={`Queues · ${(data?.total ?? 0).toLocaleString()} in ${status}`} title="Data change requests" />

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				{TABS.map((t) => (
					<button key={t.key} className={`chip ${status === t.key ? 'on' : ''}`} onClick={() => { setStatus(t.key); setPage(1); }}>
						{t.label}
					</button>
				))}
			</div>

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={items.length === 0} emptyMsg={`Nothing in ${status}.`} onRetry={() => void refresh()}>
				<table className="data-table">
					<thead>
						<tr>
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
							<tr key={r.id}>
								<td className="num">{new Date(r.created_at).toLocaleDateString()}</td>
								<td>
									<div style={{ fontWeight: 600 }}>{r.target_name_snapshot ?? '—'}</div>
									<div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{r.entity_type ?? ''}{r.entity_id ? ` · ${r.entity_id.slice(0, 8)}…` : ''}</div>
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
						))}
					</tbody>
				</table>
				</AsyncState>
			</div>
		</div>
	);
}
