'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { api } from '@/lib/api';

type Status = 'new' | 'reviewing' | 'added' | 'rejected';

interface Entry {
	id: string;
	name: string;
	website: string | null;
	source: string | null;
	notes: string | null;
	status: Status;
	hq_country: string | null;
	created_at: string;
}
interface Response { data: Entry[]; total: number }

const TABS: Array<{ label: string; key: Status }> = [
	{ label: 'New', key: 'new' },
	{ label: 'Reviewing', key: 'reviewing' },
	{ label: 'Added', key: 'added' },
	{ label: 'Rejected', key: 'rejected' },
];

export default function StartupsPipelinePage() {
	const { mutate } = useSWRConfig();
	const [status, setStatus] = useState<Status>('new');
	const [draft, setDraft] = useState({ name: '', website: '', source: '', notes: '' });
	const [createPending, setCreatePending] = useState(false);

	const { data } = useSWR<Response>(
		['/api/admin/startups-pipeline', { status, limit: 50 }],
		{ dedupingInterval: 15_000 },
	);

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/admin/startups-pipeline');

	const create = async () => {
		setCreatePending(true);
		try {
			await api('POST', '/api/admin/startups-pipeline', draft);
			toast.success('Added to pipeline');
			setDraft({ name: '', website: '', source: '', notes: '' });
			void refresh();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setCreatePending(false);
		}
	};
	const update = async (id: string, next: Status) => {
		try {
			await api('PATCH', `/api/admin/startups-pipeline/${id}`, { status: next });
			void refresh();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	const entries = data?.data ?? [];
	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
					Pipeline · {(data?.total ?? 0).toLocaleString()} in {status}
				</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>Startups to add</h1>
			</div>

			<div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
				<div style={{ fontWeight: 700, marginBottom: 12 }}>Submit a startup candidate</div>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: 8 }}>
					<input className="search-input" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
					<input className="search-input" placeholder="Website" value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} />
					<input className="search-input" placeholder="Source (Twitter, news…)" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} />
					<button className="btn" disabled={!draft.name || createPending} onClick={() => void create()}>Submit</button>
				</div>
			</div>

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				{TABS.map((t) => (
					<button key={t.key} className={`chip ${status === t.key ? 'on' : ''}`} onClick={() => setStatus(t.key)}>{t.label}</button>
				))}
			</div>

			<div className="card">
				<table className="data-table">
					<thead><tr><th>Date</th><th>Name</th><th>Website</th><th>Source</th><th>Notes</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
					<tbody>
						{entries.map((e) => (
							<tr key={e.id}>
								<td className="num">{new Date(e.created_at).toLocaleDateString()}</td>
								<td>{e.name}</td>
								<td><a href={e.website ?? '#'} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{e.website ?? '—'}</a></td>
								<td>{e.source ?? '—'}</td>
								<td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes ?? '—'}</td>
								<td style={{ textAlign: 'right' }}>
									{status === 'new' && (
										<>
											<button className="btn ghost" onClick={() => void update(e.id, 'reviewing')}>Review</button>{' '}
											<button className="btn" onClick={() => void update(e.id, 'added')}><Check size={12} /> Added</button>{' '}
											<button className="btn ghost" onClick={() => void update(e.id, 'rejected')}><X size={12} /></button>
										</>
									)}
									{status === 'reviewing' && (
										<>
											<button className="btn" onClick={() => void update(e.id, 'added')}><Check size={12} /> Added</button>{' '}
											<button className="btn ghost" onClick={() => void update(e.id, 'rejected')}><X size={12} /></button>
										</>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
