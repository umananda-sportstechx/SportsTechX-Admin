'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

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
	const { data } = useQuery<Response>({
		queryKey: ['/api/admin/sales', { q: search || undefined, limit: 50 }],
		staleTime: 30_000,
	});

	const rows = data?.data ?? [];
	const totalRevenue = rows.reduce((s, r) => s + (r.amount_cents ?? 0), 0) / 100;

	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
					Revenue · {(data?.total ?? 0).toLocaleString()} events
				</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>Sales</h1>
			</div>

			<div className="grid-4" style={{ marginBottom: 'var(--space-5)' }}>
				<div className="card" style={{ padding: 'var(--space-4)' }}>
					<div className="co-stat-label">Total billed (page)</div>
					<div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800 }}>${totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
				</div>
				<div className="card" style={{ padding: 'var(--space-4)' }}>
					<div className="co-stat-label">Active Pro</div>
					<div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800 }}>{rows.filter((r) => r.plan === 'pro' && r.status === 'active').length}</div>
				</div>
				<div className="card" style={{ padding: 'var(--space-4)' }}>
					<div className="co-stat-label">Free conversions</div>
					<div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800 }}>{rows.filter((r) => r.plan === 'plus').length}</div>
				</div>
				<div className="card" style={{ padding: 'var(--space-4)' }}>
					<div className="co-stat-label">Cancellations</div>
					<div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800 }}>{rows.filter((r) => r.status === 'canceled').length}</div>
				</div>
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
				<table className="data-table">
					<thead><tr><th>Date</th><th>Email</th><th>Plan</th><th>Amount</th><th>Status</th></tr></thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.id}>
								<td className="num">{new Date(r.created_at).toLocaleDateString()}</td>
								<td>{r.email ?? r.display_name ?? (r.profile_id ? `${r.profile_id.slice(0, 8)}…` : '—')}</td>
								<td>{r.plan ?? '—'}</td>
								<td className="num">{r.amount_cents != null ? `$${(r.amount_cents / 100).toFixed(2)}` : '—'}</td>
								<td><span className="tag">{r.status ?? '—'}</span></td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
