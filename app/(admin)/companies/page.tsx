'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState } from '@/components/atoms';

interface Company {
	id: string;
	name: string;
	slug?: string;
	website?: string | null;
	description?: string | null;
	primary_sector?: string | null;
	sector_id?: string | null;
	hq_country?: string | null;
	hq_city?: string | null;
	founded_year?: number | null;
	status?: string | null;
}
interface CompaniesResponse { data: Company[]; total: number; totalPages: number }
interface Sector { id: string; name: string }

const STATUSES = ['active', 'inactive', 'needs_review', 'dead', 'acquired', 'ipo', 'not_sportstech'] as const;

export default function CompaniesAdminPage() {
	const { mutate } = useSWRConfig();
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [creating, setCreating] = useState(false);
	const [editing, setEditing] = useState<Company | null>(null);
	const [removePending, setRemovePending] = useState(false);

	const { data, error, isLoading } = useSWR<CompaniesResponse>(
		['/api/companies', { search: search || undefined, page, limit: 30 }],
		{ dedupingInterval: 30_000 },
	);

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/companies');

	const remove = async (id: string, name: string) => {
		if (!confirm(`Delete ${name}?`)) return;
		setRemovePending(true);
		try {
			await api('DELETE', `/api/admin/companies/${id}`);
			toast.success('Deleted');
			void refresh();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setRemovePending(false);
		}
	};

	const companies = data?.data ?? [];
	return (
		<div>
			<PageHeader kicker={`Database · ${(data?.total ?? 0).toLocaleString()} companies`} title="Companies & deals" />

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				<input
					className="search-input"
					style={{ flex: '0 0 320px', height: 32 }}
					placeholder="Search…"
					value={search}
					onChange={(e) => { setSearch(e.target.value); setPage(1); }}
				/>
				<div style={{ flex: 1 }} />
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add company</button>
			</div>

			{(creating || editing) && (
				<CompanyModal
					initial={editing}
					onClose={() => { setCreating(false); setEditing(null); }}
					onSaved={() => { setCreating(false); setEditing(null); void refresh(); }}
				/>
			)}

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={companies.length === 0} emptyMsg={search ? 'No companies match.' : 'No companies yet.'} onRetry={() => void refresh()}>
					<table className="data-table">
						<thead><tr><th>Name</th><th>Slug</th><th>Sector</th><th>HQ</th><th>Status</th><th style={{ textAlign: 'right' }} /></tr></thead>
						<tbody>
							{companies.map((c) => (
								<tr key={c.id}>
									<td>{c.name}</td>
									<td className="num">{c.slug ?? '—'}</td>
									<td>{c.primary_sector ?? '—'}</td>
									<td>{c.hq_country ?? '—'}</td>
									<td>{c.status ?? '—'}</td>
									<td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
										<button className="btn ghost" onClick={() => setEditing(c)}>Edit</button>
										<button className="btn ghost" style={{ color: 'var(--accent)' }} disabled={removePending} onClick={() => void remove(c.id, c.name)}>
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

function CompanyModal({ initial, onClose, onSaved }: { initial: Company | null; onClose: () => void; onSaved: () => void }) {
	const isEdit = !!initial;
	const { data: sectors } = useSWR<Sector[]>(['/api/sectors', {}], { dedupingInterval: 300_000 });
	const [name, setName] = useState(initial?.name ?? '');
	const [website, setWebsite] = useState(initial?.website ?? '');
	const [slug, setSlug] = useState(initial?.slug ?? '');
	const [description, setDescription] = useState(initial?.description ?? '');
	const [sectorId, setSectorId] = useState<string>(initial?.sector_id ?? '');
	const [hqCountry, setHqCountry] = useState(initial?.hq_country ?? '');
	const [hqCity, setHqCity] = useState(initial?.hq_city ?? '');
	const [foundedYear, setFoundedYear] = useState<string>(initial?.founded_year ? String(initial.founded_year) : '');
	const [status, setStatus] = useState<string>(initial?.status ?? 'active');
	const [pending, setPending] = useState(false);

	const submit = async () => {
		setPending(true);
		try {
			const body: Record<string, unknown> = {
				name: name.trim(),
				website: website.trim(),
				slug: slug.trim() || undefined,
				description: description.trim() || undefined,
				sector_id: sectorId || undefined,
				hq_country: hqCountry.trim() || undefined,
				hq_city: hqCity.trim() || undefined,
				founded_year: foundedYear ? Number(foundedYear) : undefined,
				status,
			};
			if (isEdit) await api('PATCH', `/api/admin/companies/${initial!.id}`, body);
			else await api('POST', '/api/admin/companies', body);
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
			title={isEdit ? 'Edit company' : 'New company'}
			onClose={onClose}
			width={560}
			footer={
				<>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={!name.trim() || !website.trim() || pending} onClick={() => void submit()}>
						<Save size={12} /> {pending ? 'Saving…' : 'Save'}
					</button>
				</>
			}
		>
			<div style={{ display: 'grid', gap: 12 }}>
				<Field label="Name"><input className="search-input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
				<Field label="Website (required, must be unique)"><input className="search-input" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" /></Field>
				<Field label={isEdit ? 'Slug' : 'Slug (optional — auto from name)'}><input className="search-input" style={{ fontFamily: 'var(--font-mono)' }} value={slug} onChange={(e) => setSlug(e.target.value)} disabled={isEdit} /></Field>
				<Field label="Description"><textarea className="search-input" style={{ minHeight: 80, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
				<Field label="Sector">
					<select className="search-input" value={sectorId} onChange={(e) => setSectorId(e.target.value)}>
						<option value="">—</option>
						{(sectors ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
					</select>
				</Field>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 12 }}>
					<Field label="HQ country"><input className="search-input" value={hqCountry} onChange={(e) => setHqCountry(e.target.value)} /></Field>
					<Field label="HQ city"><input className="search-input" value={hqCity} onChange={(e) => setHqCity(e.target.value)} /></Field>
					<Field label="Founded"><input className="search-input" type="number" value={foundedYear} onChange={(e) => setFoundedYear(e.target.value)} /></Field>
				</div>
				<Field label="Status">
					<select className="search-input" value={status} onChange={(e) => setStatus(e.target.value)}>
						{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
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
