'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState, Loading } from '@/components/atoms';
import { TabbedForm, Field, useTabs } from '@/components/tabbed-form';
import {
	SectorCascade, SportsPicker, TechTagsPicker, LocationFields, SocialLinks,
	EMPTY_SOCIAL, type SocialValue, type LocationValue,
} from '@/components/entity-pickers';

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

const STATUSES = ['active', 'inactive', 'needs_review', 'dead', 'acquired', 'ipo', 'not_sportstech'] as const;
const BUSINESS_MODELS = ['b2b', 'b2c', 'b2b2c', 'd2c', 'b2g', 'other'] as const;

export default function CompaniesAdminPage() {
	const { mutate } = useSWRConfig();
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [creating, setCreating] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
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
			<PageHeader kicker={`Database · ${(data?.total ?? 0).toLocaleString()} companies`} title="Companies" />

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

			{(creating || editingId) && (
				<CompanyModal
					id={editingId}
					onClose={() => { setCreating(false); setEditingId(null); }}
					onSaved={() => { setCreating(false); setEditingId(null); void refresh(); }}
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
										<button className="btn ghost" onClick={() => setEditingId(c.id)}>Edit</button>
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

interface CompanyForm {
	name: string;
	website: string;
	slug: string;
	description: string;
	custom_logo_url: string;
	sector_id: string;
	business_model: string;
	hq: LocationValue;
	founded_year: string;
	ipo_date: string;
	status: string;
	is_verified: boolean;
	is_unicorn: boolean;
	is_actively_raising: boolean;
	social: SocialValue;
	sport_ids: string[];
	tech_tag_ids: string[];
}

const EMPTY_COMPANY: CompanyForm = {
	name: '', website: '', slug: '', description: '', custom_logo_url: '',
	sector_id: '', business_model: '', hq: { country: '', city: '' },
	founded_year: '', ipo_date: '', status: 'active',
	is_verified: false, is_unicorn: false, is_actively_raising: false,
	social: { ...EMPTY_SOCIAL }, sport_ids: [], tech_tag_ids: [],
};

interface CompanyEdit extends Company {
	custom_logo_url?: string | null;
	business_model?: string | null;
	ipo_date?: string | null;
	is_verified?: boolean;
	is_unicorn?: boolean;
	is_actively_raising?: boolean;
	twitter_url?: string | null; instagram_url?: string | null; facebook_url?: string | null;
	linkedin_url?: string | null; youtube_url?: string | null; email?: string | null;
	sport_ids?: string[]; tech_tag_ids?: string[];
}

function toCompanyForm(h: CompanyEdit): CompanyForm {
	return {
		name: h.name ?? '', website: h.website ?? '', slug: h.slug ?? '', description: h.description ?? '',
		custom_logo_url: h.custom_logo_url ?? '', sector_id: h.sector_id ?? '', business_model: h.business_model ?? '',
		hq: { country: h.hq_country ?? '', city: h.hq_city ?? '' },
		founded_year: h.founded_year ? String(h.founded_year) : '',
		ipo_date: h.ipo_date ? String(h.ipo_date).slice(0, 10) : '',
		status: h.status ?? 'active', is_verified: !!h.is_verified, is_unicorn: !!h.is_unicorn, is_actively_raising: !!h.is_actively_raising,
		social: {
			twitter_url: h.twitter_url ?? '', instagram_url: h.instagram_url ?? '', facebook_url: h.facebook_url ?? '',
			linkedin_url: h.linkedin_url ?? '', youtube_url: h.youtube_url ?? '', email: h.email ?? '',
		},
		sport_ids: h.sport_ids ?? [], tech_tag_ids: h.tech_tag_ids ?? [],
	};
}

// Outer modal fetches the edit payload (when editing) and only mounts the form
// once data is ready, so the form can seed useState from props directly — no
// setState-in-effect, no cascading renders.
function CompanyModal({ id, onClose, onSaved }: { id: string | null; onClose: () => void; onSaved: () => void }) {
	const isEdit = !!id;
	const { data: hydrated } = useSWR<CompanyEdit>(isEdit ? [`/api/admin/companies/${id}/edit`] : null, { revalidateOnFocus: false });
	if (isEdit && !hydrated) return <Modal title="Edit company" onClose={onClose}><Loading msg="Loading company…" /></Modal>;
	return <CompanyForm id={id} initial={hydrated ? toCompanyForm(hydrated) : EMPTY_COMPANY} onClose={onClose} onSaved={onSaved} />;
}

function CompanyForm({ id, initial, onClose, onSaved }: { id: string | null; initial: CompanyForm; onClose: () => void; onSaved: () => void }) {
	const isEdit = !!id;
	const [tab, setTab] = useTabs('profile');
	const [form, setForm] = useState<CompanyForm>(initial);
	const [pending, setPending] = useState(false);

	const set = <K extends keyof CompanyForm>(k: K, v: CompanyForm[K]) => setForm((f) => ({ ...f, [k]: v }));

	const submit = async () => {
		setPending(true);
		try {
			const body: Record<string, unknown> = {
				name: form.name.trim(),
				website: form.website.trim(),
				slug: form.slug.trim() || undefined,
				description: form.description.trim() || undefined,
				custom_logo_url: form.custom_logo_url.trim() || undefined,
				sector_id: form.sector_id || undefined,
				business_model: form.business_model || undefined,
				hq_country: form.hq.country.trim() || undefined,
				hq_city: form.hq.city.trim() || undefined,
				founded_year: form.founded_year ? Number(form.founded_year) : undefined,
				ipo_date: form.ipo_date || undefined,
				status: form.status,
				is_verified: form.is_verified,
				is_unicorn: form.is_unicorn,
				is_actively_raising: form.is_actively_raising,
				social: form.social,
				sport_ids: form.sport_ids,
				tech_tag_ids: form.tech_tag_ids,
			};
			if (isEdit) await api('PATCH', `/api/admin/companies/${id}`, body);
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
			width={680}
			footer={
				<>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={!form.name.trim() || !form.website.trim() || pending} onClick={() => void submit()}>
						<Save size={12} /> {pending ? 'Saving…' : 'Save'}
					</button>
				</>
			}
		>
			{(
				<TabbedForm
					active={tab}
					onChange={setTab}
					tabs={[
						{
							key: 'profile', label: 'Profile', node: (
								<>
									<Field label="Name"><input className="search-input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
									<Field label="Website (required, must be unique)"><input className="search-input" type="url" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" /></Field>
									<Field label={isEdit ? 'Slug' : 'Slug (optional — auto from name)'}><input className="search-input" style={{ fontFamily: 'var(--font-mono)' }} value={form.slug} onChange={(e) => set('slug', e.target.value)} disabled={isEdit} /></Field>
									<Field label="Description"><textarea className="search-input" style={{ minHeight: 80, resize: 'vertical' }} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
									<Field label="Logo URL"><input className="search-input" value={form.custom_logo_url} onChange={(e) => set('custom_logo_url', e.target.value)} placeholder="https://" /></Field>
									<div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
										<Field label="Founded"><input className="search-input" type="number" value={form.founded_year} onChange={(e) => set('founded_year', e.target.value)} /></Field>
										<Field label="IPO date"><input className="search-input" type="date" value={form.ipo_date} onChange={(e) => set('ipo_date', e.target.value)} /></Field>
									</div>
								</>
							),
						},
						{
							key: 'class', label: 'Classification', hint: form.sport_ids.length + form.tech_tag_ids.length, node: (
								<>
									<Field label="Sector" hint="drill into sub-sectors as needed"><SectorCascade value={form.sector_id} onChange={(v) => set('sector_id', v)} /></Field>
									<Field label="Business model">
										<select className="search-input" value={form.business_model} onChange={(e) => set('business_model', e.target.value)}>
											<option value="">—</option>
											{BUSINESS_MODELS.map((b) => <option key={b} value={b}>{b.toUpperCase()}</option>)}
										</select>
									</Field>
									<Field label="Sports"><SportsPicker value={form.sport_ids} onChange={(v) => set('sport_ids', v)} /></Field>
									<Field label="Tech tags"><TechTagsPicker value={form.tech_tag_ids} onChange={(v) => set('tech_tag_ids', v)} /></Field>
								</>
							),
						},
						{ key: 'location', label: 'Location', node: <Field label="Headquarters"><LocationFields value={form.hq} onChange={(v) => set('hq', v)} /></Field> },
						{ key: 'social', label: 'Social', node: <SocialLinks value={form.social} onChange={(v) => set('social', v)} /> },
						{
							key: 'status', label: 'Status', node: (
								<>
									<Field label="Status">
										<select className="search-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
											{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
										</select>
									</Field>
									<label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
										<input type="checkbox" checked={form.is_verified} onChange={(e) => set('is_verified', e.target.checked)} /> Verified
									</label>
									<label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
										<input type="checkbox" checked={form.is_unicorn} onChange={(e) => set('is_unicorn', e.target.checked)} /> Unicorn
									</label>
									<label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
										<input type="checkbox" checked={form.is_actively_raising} onChange={(e) => set('is_actively_raising', e.target.checked)} /> Actively raising
									</label>
								</>
							),
						},
					]}
				/>
			)}
		</Modal>
	);
}
