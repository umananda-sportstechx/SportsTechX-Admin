'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';

type DcrStatus = 'open' | 'picked_up' | 'resolved' | 'rejected';

interface Dcr {
	id: string;
	entity_type: string | null;
	entity_id: string | null;
	requested_by: string | null;
	notes: string | null;
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
	const qc = useQueryClient();
	const [status, setStatus] = useState<DcrStatus>('open');
	const [page, setPage] = useState(1);

	const { data } = useQuery<DcrResponse>({
		queryKey: ['/api/admin/data-change-requests', { status, page, limit: 30 }],
		staleTime: 15_000,
	});

	const update = useMutation({
		mutationFn: ({ id, next }: { id: string; next: DcrStatus }) =>
			api('POST', `/api/admin/data-change-requests/${id}/status`, { status: next }),
		onSuccess: () => { toast.success('Updated'); qc.invalidateQueries({ queryKey: ['/api/admin/data-change-requests'] }); },
		onError: (e: Error) => toast.error(e.message),
	});

	const items = data?.data ?? [];
	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
					Queues · {(data?.total ?? 0).toLocaleString()} in {status}
				</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>Data change requests</h1>
			</div>

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				{TABS.map((t) => (
					<button key={t.key} className={`chip ${status === t.key ? 'on' : ''}`} onClick={() => { setStatus(t.key); setPage(1); }}>
						{t.label}
					</button>
				))}
			</div>

			<div className="card">
				<table className="data-table">
					<thead>
						<tr>
							<th>Created</th>
							<th>Entity</th>
							<th>Notes</th>
							<th>Status</th>
							<th style={{ textAlign: 'right' }}>Actions</th>
						</tr>
					</thead>
					<tbody>
						{items.map((r) => (
							<tr key={r.id}>
								<td className="num">{new Date(r.created_at).toLocaleDateString()}</td>
								<td>{r.entity_type ?? '—'}{r.entity_id ? ` · ${r.entity_id.slice(0, 8)}…` : ''}</td>
								<td style={{ maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes ?? '—'}</td>
								<td><span className="tag">{r.status}</span></td>
								<td style={{ textAlign: 'right' }}>
									<div style={{ display: 'inline-flex', gap: 6 }}>
										{r.status !== 'picked_up' && r.status !== 'resolved' && (
											<button className="btn ghost" onClick={() => update.mutate({ id: r.id, next: 'picked_up' })}>Pick up</button>
										)}
										{r.status !== 'resolved' && (
											<button className="btn" onClick={() => update.mutate({ id: r.id, next: 'resolved' })}>Resolve</button>
										)}
										{r.status !== 'rejected' && (
											<button className="btn ghost" onClick={() => update.mutate({ id: r.id, next: 'rejected' })}>Reject</button>
										)}
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
