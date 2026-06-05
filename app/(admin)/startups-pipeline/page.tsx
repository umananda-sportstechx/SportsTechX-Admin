'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Check, X, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader, AsyncState, StatCard, Section } from '@/components/atoms';
import { Funnel } from '@/components/charts';
import { StatStrip } from '@/components/filters';

type Status = 'new' | 'reviewing' | 'added' | 'rejected';
interface QueueStats { pipeline: Array<{ label: string; value: number }> }

interface Entry {
	id: string;
	name: string;
	website: string | null;
	source: string | null;
	notes: string | null;
	status: Status;
	hq_country: string | null;
	hq_city: string | null;
	created_at: string;
}
interface Response { data: Entry[]; total: number }

const TABS: Array<{ label: string; key: Status }> = [
	{ label: 'New', key: 'new' },
	{ label: 'Reviewing', key: 'reviewing' },
	{ label: 'Added', key: 'added' },
	{ label: 'Rejected', key: 'rejected' },
];

const emptyDraft = { name: '', website: '', source: '', notes: '', hq_country: '', hq_city: '' };

export default function StartupsPipelinePage() {
	const { mutate } = useSWRConfig();
	const [status, setStatus] = useState<Status>('new');
	const [draft, setDraft] = useState({ ...emptyDraft });
	const [createPending, setCreatePending] = useState(false);

	const { data, error, isLoading } = useSWR<Response>(
		['/api/admin/startups-pipeline', { status, limit: 50 }],
		{ dedupingInterval: 15_000 },
	);
	const stats = useSWR<QueueStats>(['/api/admin/stats/queues'], { dedupingInterval: 60_000 });
	const pl: Record<string, number> = Object.fromEntries((stats.data?.pipeline ?? []).map((b) => [b.label, b.value]));

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/admin/startups-pipeline');

	const create = async () => {
		setCreatePending(true);
		try {
			// Omit empty optional fields — server validates website with .url(), so
			// an empty string would 422. Send only filled-in values.
			const body: Record<string, unknown> = { name: draft.name.trim() };
			for (const k of ['website', 'source', 'notes', 'hq_country', 'hq_city'] as const) {
				if (draft[k].trim()) body[k] = draft[k].trim();
			}
			await api('POST', '/api/admin/startups-pipeline', body);
			toast.success('Added to pipeline');
			setDraft({ ...emptyDraft });
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
	const remove = async (id: string, name: string) => {
		if (!confirm(`Delete ${name} from the pipeline?`)) return;
		try {
			await api('DELETE', `/api/admin/startups-pipeline/${id}`);
			toast.success('Deleted');
			void refresh();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	const entries = data?.data ?? [];
	return (
		<div>
			<PageHeader kicker={`Pipeline · ${(data?.total ?? 0).toLocaleString()} in ${status}`} title="Startups to add" />

			<StatStrip cols={4}>
				<StatCard label="New" loading={stats.isLoading} value={(pl.new ?? 0).toLocaleString()} urgent={(pl.new ?? 0) > 0} />
				<StatCard label="Reviewing" loading={stats.isLoading} value={(pl.reviewing ?? 0).toLocaleString()} />
				<StatCard label="Added" loading={stats.isLoading} value={(pl.added ?? 0).toLocaleString()} />
				<StatCard label="Rejected" loading={stats.isLoading} value={(pl.rejected ?? 0).toLocaleString()} />
			</StatStrip>

			<Section title="Pipeline funnel" meta="new → added">
				<Funnel stages={[
					{ label: 'New', value: pl.new ?? 0 },
					{ label: 'Reviewing', value: pl.reviewing ?? 0 },
					{ label: 'Added', value: pl.added ?? 0, color: 'var(--pos)' },
					{ label: 'Rejected', value: pl.rejected ?? 0, color: 'var(--neg)' },
				]} />
			</Section>

			<div style={{ height: 'var(--space-4)' }} />

			<div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
				<div style={{ fontWeight: 700, marginBottom: 12 }}>Submit a startup candidate</div>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
					<input className="search-input" placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
					<input className="search-input" placeholder="Website (https://…)" value={draft.website} onChange={(e) => setDraft({ ...draft, website: e.target.value })} />
					<input className="search-input" placeholder="Source (Twitter, news…)" value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })} />
				</div>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
					<input className="search-input" placeholder="HQ country" value={draft.hq_country} onChange={(e) => setDraft({ ...draft, hq_country: e.target.value })} />
					<input className="search-input" placeholder="HQ city" value={draft.hq_city} onChange={(e) => setDraft({ ...draft, hq_city: e.target.value })} />
				</div>
				<textarea
					className="search-input"
					placeholder="Notes"
					value={draft.notes}
					onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
					style={{ width: '100%', marginTop: 8, minHeight: 60, resize: 'vertical' }}
				/>
				<button className="btn" style={{ marginTop: 10 }} disabled={!draft.name.trim() || createPending} onClick={() => void create()}>Submit</button>
			</div>

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				{TABS.map((t) => (
					<button key={t.key} className={`chip ${status === t.key ? 'on' : ''}`} onClick={() => setStatus(t.key)}>{t.label}</button>
				))}
			</div>

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={entries.length === 0} emptyMsg={`Nothing in ${status}.`} onRetry={() => void refresh()}>
				<table className="data-table">
					<thead><tr><th>Date</th><th>Name</th><th>Website</th><th>HQ</th><th>Source</th><th>Notes</th><th style={{ textAlign: 'right' }}>Actions</th></tr></thead>
					<tbody>
						{entries.map((e) => (
							<tr key={e.id}>
								<td className="num">{new Date(e.created_at).toLocaleDateString()}</td>
								<td>{e.name}</td>
								<td><a href={e.website ?? '#'} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{e.website ?? '—'}</a></td>
								<td>{e.hq_country ?? '—'}</td>
								<td>{e.source ?? '—'}</td>
								<td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.notes ?? '—'}</td>
								<td style={{ textAlign: 'right' }}>
									<div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
										{status === 'new' && (
											<button className="btn ghost" onClick={() => void update(e.id, 'reviewing')}>Review</button>
										)}
										{(status === 'new' || status === 'reviewing') && (
											<button className="btn" onClick={() => void update(e.id, 'added')}><Check size={12} /> Added</button>
										)}
										{status !== 'rejected' && status !== 'added' && (
											<button className="btn ghost" onClick={() => void update(e.id, 'rejected')}><X size={12} /></button>
										)}
										{(status === 'added' || status === 'rejected') && (
											<button className="btn ghost" onClick={() => void update(e.id, 'reviewing')}>Re-open</button>
										)}
										<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void remove(e.id, e.name)}><Trash2 size={12} /></button>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				</AsyncState>
			</div>
		</div>
	);
}
