'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState } from '@/components/atoms';

interface Investor {
	id: string;
	name: string;
	slug?: string;
	website?: string | null;
	description?: string | null;
	category?: string | null;
	year_launched?: number | null;
	status?: string | null;
	is_verified?: boolean | null;
	actively_investing?: boolean | null;
}

interface InvestorsResponse { data: Investor[]; total: number; totalPages: number }

const CATEGORIES = [
	'venture_capital', 'private_equity', 'financial_services',
	'family_investment_office', 'sovereign_wealth_fund', 'angel', 'other',
] as const;

export default function InvestorsAdminPage() {
	const { mutate } = useSWRConfig();
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [creating, setCreating] = useState(false);
	const [editing, setEditing] = useState<Investor | null>(null);

	const { data, error, isLoading } = useSWR<InvestorsResponse>(
		['/api/investors', { search: search || undefined, page, limit: 30 }],
		{ dedupingInterval: 30_000 },
	);

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/investors');

	const remove = async (id: string) => {
		if (!confirm('Delete this investor? This cannot be undone.')) return;
		try {
			await api('DELETE', `/api/admin/investors/${id}`);
			toast.success('Deleted');
			void refresh();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	const rows = data?.data ?? [];
	return (
		<div>
			<PageHeader kicker={`Capital · ${(data?.total ?? 0).toLocaleString()} investors`} title="Investors" />

			<div className="filter-bar" style={{ marginBottom: 12 }}>
				<input
					className="search-input"
					style={{ flex: '0 0 320px', height: 32 }}
					placeholder="Search investors…"
					value={search}
					onChange={(e) => { setSearch(e.target.value); setPage(1); }}
				/>
				<div style={{ flex: 1 }} />
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add investor</button>
			</div>

			{(creating || editing) && (
				<InvestorModal
					initial={editing}
					onClose={() => { setCreating(false); setEditing(null); }}
					onSaved={() => { setCreating(false); setEditing(null); void refresh(); }}
				/>
			)}

			<div className="card" style={{ padding: 0, overflow: 'hidden' }}>
				<AsyncState loading={isLoading} error={error} empty={rows.length === 0} emptyMsg={search ? 'No investors match.' : 'No investors yet.'} onRetry={() => void refresh()}>
					<table className="data-table" style={{ width: '100%' }}>
						<thead>
							<tr>
								<th>Name</th>
								<th>Category</th>
								<th>Launched</th>
								<th>Status</th>
								<th>Verified</th>
								<th />
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.id}>
									<td><div style={{ fontWeight: 600 }}>{r.name}</div>{r.website && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{r.website}</div>}</td>
									<td>{r.category ?? '—'}</td>
									<td>{r.year_launched ?? '—'}</td>
									<td>{r.status ?? '—'}</td>
									<td>{r.is_verified ? '✓' : '—'}</td>
									<td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
										<button className="btn ghost" onClick={() => setEditing(r)}>Edit</button>
										<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void remove(r.id)}><Trash2 size={12} /></button>
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

function InvestorModal({ initial, onClose, onSaved }: { initial: Investor | null; onClose: () => void; onSaved: () => void }) {
	const isEdit = !!initial;
	const [name, setName] = useState(initial?.name ?? '');
	const [slug, setSlug] = useState(initial?.slug ?? '');
	const [website, setWebsite] = useState(initial?.website ?? '');
	const [description, setDescription] = useState(initial?.description ?? '');
	const [category, setCategory] = useState<string>(initial?.category ?? '');
	const [yearLaunched, setYearLaunched] = useState<string>(initial?.year_launched ? String(initial.year_launched) : '');
	const [status, setStatus] = useState<string>(initial?.status ?? 'active');
	const [isVerified, setIsVerified] = useState<boolean>(!!initial?.is_verified);
	const [activelyInvesting, setActivelyInvesting] = useState<boolean>(!!initial?.actively_investing);
	const [pending, setPending] = useState(false);

	const submit = async () => {
		setPending(true);
		try {
			const body: Record<string, unknown> = {
				name: name.trim(),
				slug: slug.trim() || undefined,
				website: website.trim() || null,
				description: description.trim() || null,
				category: category || null,
				year_launched: yearLaunched ? Number(yearLaunched) : null,
				status,
				is_verified: isVerified,
				actively_investing: activelyInvesting,
			};
			if (isEdit) await api('PATCH', `/api/admin/investors/${initial!.id}`, body);
			else await api('POST', '/api/admin/investors', body);
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
			title={isEdit ? 'Edit investor' : 'New investor'}
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
				<Field label={isEdit ? 'Slug' : 'Slug (optional — auto from name)'}><input className="search-input" style={{ fontFamily: 'var(--font-mono)' }} value={slug} onChange={(e) => setSlug(e.target.value)} disabled={isEdit} /></Field>
				<Field label="Website"><input className="search-input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" /></Field>
				<Field label="Description"><textarea className="search-input" style={{ minHeight: 80, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
					<Field label="Category">
						<select className="search-input" value={category} onChange={(e) => setCategory(e.target.value)}>
							<option value="">—</option>
							{CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
						</select>
					</Field>
					<Field label="Launched"><input className="search-input" type="number" value={yearLaunched} onChange={(e) => setYearLaunched(e.target.value)} /></Field>
				</div>
				<Field label="Status">
					<div style={{ display: 'flex', gap: 6 }}>
						{(['active', 'paused', 'inactive'] as const).map((s) => (
							<button key={s} type="button" className={`chip ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>{s}</button>
						))}
					</div>
				</Field>
				<div style={{ display: 'flex', gap: 16 }}>
					<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
						<input type="checkbox" checked={isVerified} onChange={(e) => setIsVerified(e.target.checked)} /> Verified
					</label>
					<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
						<input type="checkbox" checked={activelyInvesting} onChange={(e) => setActivelyInvesting(e.target.checked)} /> Actively investing
					</label>
				</div>
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
