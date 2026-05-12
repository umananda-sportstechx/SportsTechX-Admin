'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

interface Entity { id: string; name: string; slug?: string; entity_type: string; status?: string; hq_country?: string }
interface Response { data: Entity[]; total: number; totalPages: number }

export default function EcosystemAdminPage() {
	const qc = useQueryClient();
	const [type, setType] = useState<'program' | 'event'>('program');
	const [page, setPage] = useState(1);
	const [draft, setDraft] = useState({ name: '', entity_type: 'program' });

	const { data } = useQuery<Response>({
		queryKey: ['/api/ecosystem-entities', { type, page, limit: 30 }],
		staleTime: 30_000,
	});

	const create = useMutation({
		mutationFn: () => api('POST', '/api/admin/ecosystem-entities', { ...draft, entity_type: type }),
		onSuccess: () => { toast.success('Created'); setDraft({ name: '', entity_type: type }); qc.invalidateQueries({ queryKey: ['/api/ecosystem-entities'] }); },
		onError: (e: Error) => toast.error(e.message),
	});
	const remove = useMutation({
		mutationFn: (id: string) => api('DELETE', `/api/admin/ecosystem-entities/${id}`),
		onSuccess: () => { toast.success('Deleted'); qc.invalidateQueries({ queryKey: ['/api/ecosystem-entities'] }); },
		onError: (e: Error) => toast.error(e.message),
	});

	const entities = data?.data ?? [];
	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
					Ecosystem · {(data?.total ?? 0).toLocaleString()} {type}s
				</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>Programs & events</h1>
			</div>

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				<button className={`chip ${type === 'program' ? 'on' : ''}`} onClick={() => { setType('program'); setPage(1); }}>Programs</button>
				<button className={`chip ${type === 'event' ? 'on' : ''}`} onClick={() => { setType('event'); setPage(1); }}>Events</button>
			</div>

			<div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
				<div style={{ fontWeight: 700, marginBottom: 12 }}>Add a {type}</div>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
					<input className="search-input" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
					<button className="btn" disabled={!draft.name || create.isPending} onClick={() => create.mutate()}>Add</button>
				</div>
			</div>

			<div className="card">
				<table className="data-table">
					<thead><tr><th>Name</th><th>Slug</th><th>Status</th><th>HQ</th><th style={{ textAlign: 'right' }}></th></tr></thead>
					<tbody>
						{entities.map((e) => (
							<tr key={e.id}>
								<td>{e.name}</td>
								<td className="num">{e.slug ?? '—'}</td>
								<td>{e.status ?? '—'}</td>
								<td>{e.hq_country ?? '—'}</td>
								<td style={{ textAlign: 'right' }}>
									<button className="btn ghost" disabled={remove.isPending} onClick={() => confirm(`Delete ${e.name}?`) && remove.mutate(e.id)}>
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
