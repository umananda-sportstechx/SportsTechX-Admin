'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader, StatCard, AsyncState, Tag } from '@/components/atoms';

interface Sale {
	id: string;
	// `billing_events.profile_id` is `REFERENCES profiles(id) ON DELETE SET NULL`,
	// so it can be null after a user is deleted while their billing audit row
	// stays around.
	profile_id: string | null;
	email: string | null;
	display_name: string | null;
	plan: string | null;
	amount_cents: number | null;
	currency: string | null;
	status: string | null;
	created_at: string;
}
interface Response { data: Sale[]; total: number }

export default function SalesAdminPage() {
	const [search, setSearch] = useState('');
	const { data, error, isLoading, mutate } = useSWR<Response>(
		['/api/admin/sales', { q: search || undefined, limit: 50 }],
		{ dedupingInterval: 30_000 },
	);

	const rows = data?.data ?? [];
	const totalRevenue = rows.reduce((s, r) => s + (r.amount_cents ?? 0), 0) / 100;
	const activePro = rows.filter((r) => r.plan === 'pro' && r.status === 'active').length;
	const activeGrowth = rows.filter((r) => r.plan === 'growth' && r.status === 'active').length;
	const cancellations = rows.filter((r) => r.status === 'canceled').length;

	return (
		<div>
			<PageHeader
				kicker={`Revenue · ${(data?.total ?? 0).toLocaleString()} billing events`}
				title="Sales"
				subtitle="Recent Stripe billing events joined with profiles. Stat tiles reflect the current page of results."
			/>

			<div className="grid-4" style={{ marginBottom: 'var(--space-5)' }}>
				<StatCard label="Total billed (page)" loading={isLoading} value={`$${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
				<StatCard label="Active Pro (page)" loading={isLoading} value={activePro} />
				<StatCard label="Active Growth (page)" loading={isLoading} value={activeGrowth} />
				<StatCard label="Cancellations (page)" loading={isLoading} value={cancellations} />
			</div>

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				<input
					className="search-input"
					style={{ flex: '0 0 320px', height: 32 }}
					placeholder="Search by email or name…"
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
			</div>

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={rows.length === 0} emptyMsg={search ? 'No matching billing events' : 'No billing events yet'} onRetry={() => void mutate()}>
					<table className="data-table">
						<thead><tr><th>Date</th><th>Customer</th><th>Plan</th><th>Amount</th><th>Status</th></tr></thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.id}>
									<td className="num">{new Date(r.created_at).toLocaleDateString()}</td>
									<td>{r.email ?? r.display_name ?? (r.profile_id ? `${r.profile_id.slice(0, 8)}…` : '—')}</td>
									<td>{r.plan ?? '—'}</td>
									<td className="num">{r.amount_cents != null ? `$${(r.amount_cents / 100).toFixed(2)}` : '—'}</td>
									<td><Tag variant={r.status === 'active' ? 'pos' : r.status === 'canceled' ? 'neg' : ''}>{r.status ?? '—'}</Tag></td>
								</tr>
							))}
						</tbody>
					</table>
				</AsyncState>
			</div>
		</div>
	);
}
