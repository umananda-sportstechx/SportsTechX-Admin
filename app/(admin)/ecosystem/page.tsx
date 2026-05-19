'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

interface Entity { id: string; name: string; slug?: string; entity_type: string; status?: string; hq_country?: string }
interface Response { data: Entity[]; total: number; totalPages: number }

export default function EcosystemAdminPage() {
	const { mutate } = useSWRConfig();
	const [type, setType] = useState<'program' | 'event'>('program');
	const [page, setPage] = useState(1);
	const [draft, setDraft] = useState({ name: '', entity_type: 'program' });
	const [createPending, setCreatePending] = useState(false);
	const [removePending, setRemovePending] = useState(false);

	const { data } = useSWR<Response>(
		['/api/ecosystem-entities', { type, page, limit: 30 }],
		{ dedupingInterval: 30_000 },
	);

	const create = async () => {
		setCreatePending(true);
		try {
			await api('POST', '/api/admin/ecosystem-entities', { ...draft, entity_type: type });
			toast.success('Created');
			setDraft({ name: '', entity_type: type });
			void mutate((key) => Array.isArray(key) && key[0] === '/api/ecosystem-entities');
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setCreatePending(false);
		}
	};

	const remove = async (id: string) => {
		setRemovePending(true);
		try {
			await api('DELETE', `/api/admin/ecosystem-entities/${id}`);
			toast.success('Deleted');
			void mutate((key) => Array.isArray(key) && key[0] === '/api/ecosystem-entities');
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setRemovePending(false);
		}
	};

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
					<button className="btn" disabled={!draft.name || createPending} onClick={() => void create()}>Add</button>
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
									<button className="btn ghost" disabled={removePending} onClick={() => { if (confirm(`Delete ${e.name}?`)) void remove(e.id); }}>
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
