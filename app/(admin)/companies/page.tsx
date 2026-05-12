'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

interface Company { id: string; name: string; slug?: string; primary_sector?: string; hq_country?: string; status?: string }
interface CompaniesResponse { data: Company[]; total: number; totalPages: number }

export default function CompaniesAdminPage() {
	const qc = useQueryClient();
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [newCompany, setNewCompany] = useState({ name: '', website: '', hq_country: '' });

	const { data } = useQuery<CompaniesResponse>({
		queryKey: ['/api/companies', { search: search || undefined, page, limit: 30 }],
		staleTime: 30_000,
	});

	const create = useMutation({
		mutationFn: () => api('POST', '/api/admin/companies', newCompany),
		onSuccess: () => {
			toast.success('Company created');
			setNewCompany({ name: '', website: '', hq_country: '' });
			qc.invalidateQueries({ queryKey: ['/api/companies'] });
		},
		onError: (e: Error) => toast.error(e.message),
	});
	const remove = useMutation({
		mutationFn: (id: string) => api('DELETE', `/api/admin/companies/${id}`),
		onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['/api/companies'] }); },
		onError: (e: Error) => toast.error(e.message),
	});

	const companies = data?.data ?? [];
	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
					Database · {(data?.total ?? 0).toLocaleString()} companies
				</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>Companies & deals</h1>
			</div>

			<div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
				<div style={{ fontWeight: 700, marginBottom: 12 }}>Add a company</div>
				<div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: 8 }}>
					<input className="search-input" placeholder="Name" value={newCompany.name} onChange={(e) => setNewCompany({ ...newCompany, name: e.target.value })} />
					<input className="search-input" placeholder="Website" value={newCompany.website} onChange={(e) => setNewCompany({ ...newCompany, website: e.target.value })} />
					<input className="search-input" placeholder="HQ country" value={newCompany.hq_country} onChange={(e) => setNewCompany({ ...newCompany, hq_country: e.target.value })} />
					<button className="btn" disabled={!newCompany.name || create.isPending} onClick={() => create.mutate()}>Add</button>
				</div>
			</div>

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				<input
					className="search-input"
					style={{ flex: '0 0 320px', height: 32 }}
					placeholder="Search…"
					value={search}
					onChange={(e) => { setSearch(e.target.value); setPage(1); }}
				/>
			</div>

			<div className="card">
				<table className="data-table">
					<thead><tr><th>Name</th><th>Slug</th><th>Sector</th><th>HQ</th><th>Status</th><th style={{ textAlign: 'right' }}></th></tr></thead>
					<tbody>
						{companies.map((c) => (
							<tr key={c.id}>
								<td>{c.name}</td>
								<td className="num">{c.slug ?? '—'}</td>
								<td>{c.primary_sector ?? '—'}</td>
								<td>{c.hq_country ?? '—'}</td>
								<td>{c.status ?? '—'}</td>
								<td style={{ textAlign: 'right' }}>
									<button className="btn ghost" disabled={remove.isPending} onClick={() => confirm(`Delete ${c.name}?`) && remove.mutate(c.id)}>
										<Trash2 size={12} />
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
