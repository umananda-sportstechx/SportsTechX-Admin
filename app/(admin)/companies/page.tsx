'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

interface Company { id: string; name: string; slug?: string; primary_sector?: string; hq_country?: string; status?: string }
interface CompaniesResponse { data: Company[]; total: number; totalPages: number }

export default function CompaniesAdminPage() {
	const { mutate } = useSWRConfig();
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [newCompany, setNewCompany] = useState({ name: '', website: '', hq_country: '' });
	const [createPending, setCreatePending] = useState(false);
	const [removePending, setRemovePending] = useState(false);

	const { data } = useSWR<CompaniesResponse>(
		['/api/companies', { search: search || undefined, page, limit: 30 }],
		{ dedupingInterval: 30_000 },
	);

	const create = async () => {
		setCreatePending(true);
		try {
			await api('POST', '/api/admin/companies', newCompany);
			toast.success('Company created');
			setNewCompany({ name: '', website: '', hq_country: '' });
			void mutate((key) => Array.isArray(key) && key[0] === '/api/companies');
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setCreatePending(false);
		}
	};

	const remove = async (id: string) => {
		setRemovePending(true);
		try {
			await api('DELETE', `/api/admin/companies/${id}`);
			toast.success('Deleted');
			void mutate((key) => Array.isArray(key) && key[0] === '/api/companies');
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setRemovePending(false);
		}
	};

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
					<button className="btn" disabled={!newCompany.name || createPending} onClick={() => void create()}>Add</button>
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
									<button className="btn ghost" disabled={removePending} onClick={() => { if (confirm(`Delete ${c.name}?`)) void remove(c.id); }}>
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
