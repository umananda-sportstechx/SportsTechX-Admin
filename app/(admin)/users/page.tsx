'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface User {
	id: string;
	email: string | null;
	display_name: string | null;
	user_role: string | null;
	user_type: string | null;
	company_name: string | null;
	created_at: string;
	last_seen_at: string | null;
}
interface UsersResponse { data: User[]; total: number; totalPages: number }

export default function UsersAdminPage() {
	const qc = useQueryClient();
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);

	const { data } = useQuery<UsersResponse>({
		queryKey: ['/api/admin/users', { q: search || undefined, page, limit: 30 }],
		staleTime: 15_000,
	});

	const promote = useMutation({
		mutationFn: (id: string) => api('POST', `/api/admin/users/${id}/promote`),
		onSuccess: () => { toast.success('User promoted'); qc.invalidateQueries({ queryKey: ['/api/admin/users'] }); },
		onError: (e: Error) => toast.error(e.message),
	});
	const demote = useMutation({
		mutationFn: (id: string) => api('POST', `/api/admin/users/${id}/demote`),
		onSuccess: () => { toast.success('User demoted'); qc.invalidateQueries({ queryKey: ['/api/admin/users'] }); },
		onError: (e: Error) => toast.error(e.message),
	});

	const users = data?.data ?? [];
	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
					Identity · {(data?.total ?? 0).toLocaleString()} total
				</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>Users</h1>
			</div>

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				<input
					className="search-input"
					style={{ flex: '0 0 320px', height: 32 }}
					placeholder="Search email or name…"
					value={search}
					onChange={(e) => { setSearch(e.target.value); setPage(1); }}
				/>
			</div>

			<div className="card">
				<table className="data-table">
					<thead>
						<tr>
							<th>Email</th>
							<th>Name</th>
							<th>Tier</th>
							<th>Role</th>
							<th>Joined</th>
							<th style={{ textAlign: 'right' }}>Actions</th>
						</tr>
					</thead>
					<tbody>
						{users.map((u) => (
							<tr key={u.id}>
								<td>{u.email}</td>
								<td>{u.display_name ?? '—'}</td>
								<td><span className="tag">{u.user_type ?? 'free'}</span></td>
								<td>{u.user_role === 'admin' ? <span className="tag pos">admin</span> : 'user'}</td>
								<td className="num">{new Date(u.created_at).toLocaleDateString()}</td>
								<td style={{ textAlign: 'right' }}>
									{u.user_role === 'admin' ? (
										<button className="btn ghost" disabled={demote.isPending} onClick={() => demote.mutate(u.id)}>Demote</button>
									) : (
										<button className="btn" disabled={promote.isPending} onClick={() => promote.mutate(u.id)}>Promote</button>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
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
