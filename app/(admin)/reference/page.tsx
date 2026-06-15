'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Trash2, Save } from 'lucide-react';
import { Modal } from '@/components/modal';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/confirm';

type Kind = 'sectors' | 'sports' | 'tech-tags' | 'round-types';

const TABS: { key: Kind; label: string }[] = [
	{ key: 'sectors', label: 'Sectors' },
	{ key: 'sports', label: 'Sports' },
	{ key: 'tech-tags', label: 'Tech tags' },
	{ key: 'round-types', label: 'Round types' },
];

interface RefRow {
	id: string;
	name: string;
	slug: string;
	parent_id?: string | null;
	description?: string | null;
	sort_order?: number | null;
}

interface RefResponse { data: RefRow[] }

export default function ReferenceAdminPage() {
	const { mutate } = useSWRConfig();
	const ask = useConfirm();
	const [kind, setKind] = useState<Kind>('sectors');
	const [editing, setEditing] = useState<RefRow | null>(null);
	const [creating, setCreating] = useState(false);

	const { data } = useSWR<RefResponse>([`/api/admin/reference/${kind}`]);

	const refresh = () => mutate((key) => Array.isArray(key) && typeof key[0] === 'string' && (key[0] as string).startsWith(`/api/admin/reference/${kind}`));

	const remove = async (id: string) => {
		if (!(await ask('Delete this entry? Anything referencing it may break.'))) return;
		try {
			await api('DELETE', `/api/admin/reference/${kind}/${id}`);
			toast.success('Deleted');
			void refresh();
		} catch (e) { toast.error((e as Error).message); }
	};

	const rows = data?.data ?? [];
	const showParent = kind !== 'round-types';
	const showSortOrder = kind === 'sectors' || kind === 'round-types';

	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div className="co-stat-label" style={{ marginBottom: 6 }}>Taxonomy</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>Reference data</h1>
				<p style={{ fontSize: 14, color: 'var(--fg-2)', marginTop: 6 }}>
					Sectors, sports, tech tags, round types. Public read endpoints cache for 1h — changes propagate on the next cache miss.
				</p>
			</div>

			<div className="filter-bar" style={{ marginBottom: 12 }}>
				{TABS.map((t) => (
					<button
						key={t.key}
						className={`chip ${kind === t.key ? 'on' : ''}`}
						onClick={() => { setKind(t.key); setEditing(null); setCreating(false); }}
					>
						{t.label}
					</button>
				))}
				<div style={{ flex: 1 }} />
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add</button>
			</div>

			{(creating || editing) && (
				<RefModal
					kind={kind}
					initial={editing}
					parents={rows.filter((r) => r.id !== editing?.id)}
					onClose={() => { setCreating(false); setEditing(null); }}
					onSaved={() => { setCreating(false); setEditing(null); void refresh(); }}
				/>
			)}

			<div className="card" style={{ padding: 0, overflow: 'hidden' }}>
				<table className="data-table" style={{ width: '100%' }}>
					<thead>
						<tr>
							<th>Name</th>
							<th>Slug</th>
							{showParent && <th>Parent</th>}
							{showSortOrder && <th>Sort</th>}
							<th />
						</tr>
					</thead>
					<tbody>
						{rows.length === 0 ? (
							<tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--fg-muted)' }}>No entries.</td></tr>
						) : rows.map((r) => {
							const parent = r.parent_id ? rows.find((x) => x.id === r.parent_id) : null;
							return (
								<tr key={r.id}>
									<td style={{ fontWeight: 600, paddingLeft: r.parent_id ? 28 : 12 }}>{r.name}</td>
									<td style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{r.slug}</td>
									{showParent && <td style={{ color: 'var(--fg-muted)' }}>{parent?.name ?? '—'}</td>}
									{showSortOrder && <td>{r.sort_order ?? '—'}</td>}
									<td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
										<button className="btn ghost" onClick={() => setEditing(r)}>Edit</button>
										<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void remove(r.id)}><Trash2 size={12} /></button>
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function RefModal({ kind, initial, parents, onClose, onSaved }: { kind: Kind; initial: RefRow | null; parents: RefRow[]; onClose: () => void; onSaved: () => void }) {
	const [name, setName] = useState(initial?.name ?? '');
	const [slug, setSlug] = useState(initial?.slug ?? '');
	const [parentId, setParentId] = useState<string>(initial?.parent_id ?? '');
	const [description, setDescription] = useState<string>(initial?.description ?? '');
	const [sortOrder, setSortOrder] = useState<string>(initial?.sort_order != null ? String(initial.sort_order) : '0');
	const [pending, setPending] = useState(false);

	const showParent = kind !== 'round-types';
	const showDescription = kind === 'sectors';
	const showSort = kind === 'sectors' || kind === 'round-types';

	const submit = async () => {
		setPending(true);
		try {
			const body: Record<string, unknown> = { name: name.trim() };
			if (slug.trim()) body.slug = slug.trim();
			if (showParent) body.parent_id = parentId || null;
			if (showDescription) body.description = description.trim() || null;
			if (showSort) body.sort_order = Number(sortOrder) || 0;
			if (initial) await api('PATCH', `/api/admin/reference/${kind}/${initial.id}`, body);
			else await api('POST', `/api/admin/reference/${kind}`, body);
			toast.success(initial ? 'Saved' : 'Created');
			onSaved();
		} catch (e) { toast.error((e as Error).message); }
		finally { setPending(false); }
	};

	return (
		<Modal
			title={`${initial ? 'Edit' : 'New'} entry`}
			onClose={onClose}
			width={480}
			footer={
				<>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={!name.trim() || pending} onClick={() => void submit()}>
						<Save size={12} /> {pending ? 'Saving…' : 'Save'}
					</button>
				</>
			}
		>
			<div style={{ display: 'grid', gap: 12 }}>
				<Field label="Name"><input className="search-input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
				<Field label="Slug (optional — auto from name)"><input className="search-input" style={{ fontFamily: 'var(--font-mono)' }} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} disabled={!!initial} /></Field>
				{showParent && (
					<Field label="Parent (optional)">
						<select className="search-input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
							<option value="">— top level —</option>
							{parents.filter((p) => p.id !== initial?.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
						</select>
					</Field>
				)}
				{showDescription && <Field label="Description"><textarea className="search-input" style={{ minHeight: 60 }} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>}
				{showSort && <Field label="Sort"><input className="search-input" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></Field>}
			</div>
		</Modal>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="co-stat-label" style={{ marginBottom: 6 }}>{label}</div>
			{children}
		</div>
	);
}
