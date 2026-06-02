'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PageHeader, AsyncState } from '@/components/atoms';

type ClaimStatus = 'pending' | 'picked_up' | 'verified' | 'rejected';

interface Claim {
	id: string;
	claim_type: string;
	profile_id: string | null;
	entity_type?: string | null;
	entity_id?: string | null;
	entity_name?: string | null;
	claimant_email?: string | null;
	claimant_name?: string | null;
	company_email?: string | null;
	position_at_company?: string | null;
	status: ClaimStatus;
	is_verified: boolean;
	picked_up_at: string | null;
	verified_at: string | null;
	rejection_reason?: string | null;
	created_at: string;
}

interface ClaimsResponse { data: Claim[]; total: number; totalPages: number }

const STATUS_TABS: Array<{ label: string; key: ClaimStatus }> = [
	{ label: 'Pending', key: 'pending' },
	{ label: 'Picked up', key: 'picked_up' },
	{ label: 'Verified', key: 'verified' },
	{ label: 'Rejected', key: 'rejected' },
];

export default function ClaimsAdminPage() {
	const { mutate } = useSWRConfig();
	const [status, setStatus] = useState<ClaimStatus>('pending');
	const [page, setPage] = useState(1);
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [sendEmail, setSendEmail] = useState(true);

	const { data, error, isLoading } = useSWR<ClaimsResponse>(
		['/api/admin/claims', { status, page, limit: 30 }],
		{ dedupingInterval: 30_000 },
	);

	const claims = data?.data ?? [];

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/admin/claims');

	const act = async (id: string, fn: () => Promise<unknown>, ok: string) => {
		setPendingId(id);
		try {
			await fn();
			toast.success(ok);
			void refresh();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setPendingId(null);
		}
	};

	const pickup = (id: string) => act(id, () => api('POST', `/api/admin/claims/${id}/pickup`, { picked_up: true }), 'Claim picked up');
	const verify = (id: string) => act(id, () => api('POST', `/api/admin/claims/${id}/verify`, { send_email: sendEmail }), 'Claim verified');
	const reject = (id: string) => {
		const reason = window.prompt('Reason for rejection (optional):') ?? undefined;
		if (reason === undefined) return; // cancelled
		void act(id, () => api('POST', `/api/admin/claims/${id}/reject`, { reason }), 'Claim rejected');
	};
	const reopen = (id: string) => act(id, () => api('POST', `/api/admin/claims/${id}/reopen`), 'Claim re-opened');

	return (
		<div>
			<PageHeader kicker={`Queues · ${(data?.total ?? 0).toLocaleString()} in ${status}`} title="Claims" />

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)', alignItems: 'center' }}>
				{STATUS_TABS.map((t) => (
					<button key={t.key} className={`chip ${status === t.key ? 'on' : ''}`} onClick={() => { setStatus(t.key); setPage(1); }}>
						{t.label}
					</button>
				))}
				<div style={{ flex: 1 }} />
				<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
					<input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Send email on verify
				</label>
			</div>

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={claims.length === 0} emptyMsg={`No ${status} claims`} onRetry={() => void refresh()}>
					<table className="data-table">
						<thead>
							<tr>
								<th>Created</th>
								<th>Type</th>
								<th>Target</th>
								<th>Claimant</th>
								<th>Status</th>
								<th style={{ textAlign: 'right' }}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{claims.map((c) => (
								<tr key={c.id}>
									<td className="num">{new Date(c.created_at).toLocaleDateString()}</td>
									<td>{c.entity_type ?? c.claim_type}</td>
									<td>
										<div style={{ fontWeight: 600 }}>{c.entity_name ?? c.entity_id ?? '—'}</div>
										{c.position_at_company && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{c.position_at_company}</div>}
									</td>
									<td style={{ fontSize: 12 }}>
										<div>{c.claimant_email ?? c.company_email ?? '—'}</div>
										{c.claimant_name && <div style={{ color: 'var(--fg-muted)' }}>{c.claimant_name}</div>}
									</td>
									<td>
										{c.status === 'rejected'
											? <span className="tag neg" title={c.rejection_reason ?? undefined}>Rejected</span>
											: c.status === 'verified'
												? <span className="tag pos">Verified</span>
												: c.status === 'picked_up'
													? <span className="tag">Picked up</span>
													: <span className="tag">Pending</span>}
									</td>
									<td style={{ textAlign: 'right' }}>
										<div style={{ display: 'inline-flex', gap: 6 }}>
											{c.status === 'pending' && (
												<button className="btn ghost" disabled={pendingId === c.id} onClick={() => void pickup(c.id)}>Pick up</button>
											)}
											{c.status !== 'verified' && c.status !== 'rejected' && (
												<button className="btn" disabled={pendingId === c.id} onClick={() => void verify(c.id)}>Verify</button>
											)}
											{c.status !== 'rejected' && (
												<button className="btn ghost" style={{ color: 'var(--accent)' }} disabled={pendingId === c.id} onClick={() => reject(c.id)}>Reject</button>
											)}
											{c.status === 'rejected' && (
												<button className="btn ghost" disabled={pendingId === c.id} onClick={() => void reopen(c.id)}>Re-open</button>
											)}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</AsyncState>
			</div>

			{data && data.totalPages > 1 && (
				<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
					<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', alignSelf: 'center', marginRight: 8 }}>
						Page {page} of {data.totalPages}
					</span>
					<button className="btn ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
					<button className="btn ghost" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
				</div>
			)}
		</div>
	);
}
