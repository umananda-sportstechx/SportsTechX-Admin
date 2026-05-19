'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { api } from '@/lib/api';

type ClaimStatus = 'pending' | 'picked_up' | 'verified';

interface Claim {
	id: string;
	claim_type: string;
	profile_id: string | null;
	target_id?: string | null;
	target_name?: string | null;
	is_verified: boolean;
	picked_up_at: string | null;
	verified_at: string | null;
	created_at: string;
}

interface ClaimsResponse { data: Claim[]; total: number; totalPages: number }

const STATUS_TABS: Array<{ label: string; key: ClaimStatus }> = [
	{ label: 'Pending', key: 'pending' },
	{ label: 'Picked up', key: 'picked_up' },
	{ label: 'Verified', key: 'verified' },
];

export default function ClaimsAdminPage() {
	const { mutate } = useSWRConfig();
	const [status, setStatus] = useState<ClaimStatus>('pending');
	const [page, setPage] = useState(1);
	const [pendingId, setPendingId] = useState<string | null>(null);

	const { data, isLoading } = useSWR<ClaimsResponse>(
		['/api/admin/claims', { status, page, limit: 30 }],
		{ dedupingInterval: 30_000 },
	);

	const claims = data?.data ?? [];

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/admin/claims');

	const pickup = async (id: string) => {
		setPendingId(id);
		try {
			await api('POST', `/api/admin/claims/${id}/pickup`, { picked_up: true });
			toast.success('Claim picked up');
			void refresh();
		} catch (e) {
			toast.error((e as Error).message ?? 'Could not pick up');
		} finally {
			setPendingId(null);
		}
	};
	const verify = async (id: string) => {
		setPendingId(id);
		try {
			await api('POST', `/api/admin/claims/${id}/verify`, { send_email: true });
			toast.success('Claim verified');
			void refresh();
		} catch (e) {
			toast.error((e as Error).message ?? 'Could not verify');
		} finally {
			setPendingId(null);
		}
	};
	const reject = async (id: string) => {
		setPendingId(id);
		try {
			await api('POST', `/api/admin/claims/${id}/reject`);
			toast.success('Claim rejected');
			void refresh();
		} catch (e) {
			toast.error((e as Error).message ?? 'Could not reject');
		} finally {
			setPendingId(null);
		}
	};

	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div
					style={{
						fontFamily: 'var(--font-mono)',
						fontSize: 11,
						color: 'var(--fg-muted)',
						textTransform: 'uppercase',
						letterSpacing: '0.1em',
						marginBottom: 6,
					}}
				>
					Queues · {(data?.total ?? 0).toLocaleString()} in {status}
				</div>
				<h1
					style={{
						fontFamily: 'var(--font-display)',
						fontSize: 38,
						fontWeight: 800,
						letterSpacing: '-0.02em',
						lineHeight: 1,
						margin: 0,
					}}
				>
					Claims
				</h1>
			</div>

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				{STATUS_TABS.map((t) => (
					<button
						key={t.key}
						className={`chip ${status === t.key ? 'on' : ''}`}
						onClick={() => { setStatus(t.key); setPage(1); }}
					>
						{t.label}
					</button>
				))}
			</div>

			<div className="card">
				{isLoading ? (
					<div style={{ padding: 'var(--space-4)', color: 'var(--fg-muted)' }}>Loading…</div>
				) : claims.length === 0 ? (
					<div style={{ padding: 'var(--space-4)', color: 'var(--fg-muted)' }}>No claims</div>
				) : (
					<table className="data-table">
						<thead>
							<tr>
								<th>Created</th>
								<th>Type</th>
								<th>Target</th>
								<th>Status</th>
								<th style={{ textAlign: 'right' }}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{claims.map((c) => (
								<tr key={c.id}>
									<td className="num">{new Date(c.created_at).toLocaleDateString()}</td>
									<td>{c.claim_type}</td>
									<td>{c.target_name ?? c.target_id ?? '—'}</td>
									<td>
										{c.is_verified
											? <span className="tag pos">Verified</span>
											: c.picked_up_at
												? <span className="tag">Picked up</span>
												: <span className="tag">Pending</span>}
									</td>
									<td style={{ textAlign: 'right' }}>
										<div style={{ display: 'inline-flex', gap: 6 }}>
											{!c.picked_up_at && !c.is_verified && (
												<button className="btn ghost" disabled={pendingId === c.id} onClick={() => void pickup(c.id)}>Pick up</button>
											)}
											{!c.is_verified && (
												<button className="btn" disabled={pendingId === c.id} onClick={() => void verify(c.id)}>Verify</button>
											)}
											{c.is_verified && (
												<button className="btn ghost" disabled={pendingId === c.id} onClick={() => void reject(c.id)}>Reject</button>
											)}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
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
