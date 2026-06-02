'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState } from '@/components/atoms';

interface Entity {
	id: string;
	name: string;
	slug?: string;
	entity_type: string;
	description?: string | null;
	website?: string | null;
	category?: string | null;
	founded_year?: number | null;
	status?: string | null;
	hq_country?: string | null;
	hq_city?: string | null;
	start_date?: string | null;
	end_date?: string | null;
}
interface Response { data: Entity[]; total: number; totalPages: number }

const STATUSES = ['active', 'inactive', 'paused'] as const;

export default function EcosystemAdminPage() {
	const { mutate } = useSWRConfig();
	const [type, setType] = useState<'program' | 'event'>('program');
	const [page, setPage] = useState(1);
	const [creating, setCreating] = useState(false);
	const [editing, setEditing] = useState<Entity | null>(null);
	const [removePending, setRemovePending] = useState(false);

	const { data, error, isLoading } = useSWR<Response>(
		['/api/ecosystem-entities', { type, page, limit: 30 }],
		{ dedupingInterval: 30_000 },
	);

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/ecosystem-entities');

	const remove = async (id: string, name: string) => {
		if (!confirm(`Delete ${name}?`)) return;
		setRemovePending(true);
		try {
			await api('DELETE', `/api/admin/ecosystem-entities/${id}`);
			toast.success('Deleted');
			void refresh();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setRemovePending(false);
		}
	};

	const entities = data?.data ?? [];
	return (
		<div>
			<PageHeader kicker={`Ecosystem · ${(data?.total ?? 0).toLocaleString()} ${type}s`} title="Programs & events" />

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				<button className={`chip ${type === 'program' ? 'on' : ''}`} onClick={() => { setType('program'); setPage(1); }}>Programs</button>
				<button className={`chip ${type === 'event' ? 'on' : ''}`} onClick={() => { setType('event'); setPage(1); }}>Events</button>
				<div style={{ flex: 1 }} />
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add {type}</button>
			</div>

			{(creating || editing) && (
				<EntityModal
					initial={editing}
					defaultType={type}
					onClose={() => { setCreating(false); setEditing(null); }}
					onSaved={() => { setCreating(false); setEditing(null); void refresh(); }}
				/>
			)}

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={entities.length === 0} emptyMsg={`No ${type}s yet.`} onRetry={() => void refresh()}>
					<table className="data-table">
						<thead><tr><th>Name</th><th>Slug</th><th>Category</th><th>Status</th><th>HQ</th><th style={{ textAlign: 'right' }} /></tr></thead>
						<tbody>
							{entities.map((e) => (
								<tr key={e.id}>
									<td>{e.name}</td>
									<td className="num">{e.slug ?? '—'}</td>
									<td>{e.category ?? '—'}</td>
									<td>{e.status ?? '—'}</td>
									<td>{e.hq_country ?? '—'}</td>
									<td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
										<button className="btn ghost" onClick={() => setEditing(e)}>Edit</button>
										<button className="btn ghost" style={{ color: 'var(--accent)' }} disabled={removePending} onClick={() => void remove(e.id, e.name)}>
											<Trash2 size={12} />
										</button>
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

function EntityModal({ initial, defaultType, onClose, onSaved }: { initial: Entity | null; defaultType: 'program' | 'event'; onClose: () => void; onSaved: () => void }) {
	const isEdit = !!initial;
	const [name, setName] = useState(initial?.name ?? '');
	const [slug, setSlug] = useState(initial?.slug ?? '');
	const [entityType, setEntityType] = useState<string>(initial?.entity_type ?? defaultType);
	const [description, setDescription] = useState(initial?.description ?? '');
	const [website, setWebsite] = useState(initial?.website ?? '');
	const [category, setCategory] = useState(initial?.category ?? '');
	const [foundedYear, setFoundedYear] = useState<string>(initial?.founded_year ? String(initial.founded_year) : '');
	const [status, setStatus] = useState<string>(initial?.status ?? 'active');
	const [hqCountry, setHqCountry] = useState(initial?.hq_country ?? '');
	const [hqCity, setHqCity] = useState(initial?.hq_city ?? '');
	const [startDate, setStartDate] = useState(initial?.start_date ?? '');
	const [endDate, setEndDate] = useState(initial?.end_date ?? '');
	const [pending, setPending] = useState(false);

	const submit = async () => {
		setPending(true);
		try {
			const body: Record<string, unknown> = {
				name: name.trim(),
				slug: slug.trim() || undefined,
				entity_type: entityType,
				description: description.trim() || undefined,
				website: website.trim() || undefined,
				category: category.trim() || undefined,
				founded_year: foundedYear ? Number(foundedYear) : undefined,
				status,
				hq_country: hqCountry.trim() || undefined,
				hq_city: hqCity.trim() || undefined,
			};
			if (entityType === 'event') {
				body.start_date = startDate || undefined;
				body.end_date = endDate || undefined;
			}
			if (isEdit) await api('PATCH', `/api/admin/ecosystem-entities/${initial!.id}`, body);
			else await api('POST', '/api/admin/ecosystem-entities', body);
			toast.success(isEdit ? 'Saved' : 'Created');
			onSaved();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setPending(false);
		}
	};

	return (
		<Modal
			title={isEdit ? 'Edit entity' : 'New entity'}
			onClose={onClose}
			width={560}
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
				<Field label="Type">
					<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
						{(['program', 'event', 'organization', 'initiative'] as const).map((t) => (
							<button key={t} type="button" className={`chip ${entityType === t ? 'on' : ''}`} onClick={() => setEntityType(t)}>{t}</button>
						))}
					</div>
				</Field>
				<Field label={isEdit ? 'Slug' : 'Slug (optional — auto from name)'}><input className="search-input" style={{ fontFamily: 'var(--font-mono)' }} value={slug} onChange={(e) => setSlug(e.target.value)} disabled={isEdit} /></Field>
				<Field label="Description"><textarea className="search-input" style={{ minHeight: 80, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
					<Field label="Website"><input className="search-input" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" /></Field>
					<Field label="Category"><input className="search-input" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Incubator, VC…" /></Field>
				</div>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 12 }}>
					<Field label="HQ country"><input className="search-input" value={hqCountry} onChange={(e) => setHqCountry(e.target.value)} /></Field>
					<Field label="HQ city"><input className="search-input" value={hqCity} onChange={(e) => setHqCity(e.target.value)} /></Field>
					<Field label="Founded"><input className="search-input" type="number" value={foundedYear} onChange={(e) => setFoundedYear(e.target.value)} /></Field>
				</div>
				{entityType === 'event' && (
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
						<Field label="Start date"><input className="search-input" type="date" value={startDate ?? ''} onChange={(e) => setStartDate(e.target.value)} /></Field>
						<Field label="End date"><input className="search-input" type="date" value={endDate ?? ''} onChange={(e) => setEndDate(e.target.value)} /></Field>
					</div>
				)}
				<Field label="Status">
					<select className="search-input" value={status} onChange={(e) => setStatus(e.target.value)}>
						{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
					</select>
				</Field>
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
