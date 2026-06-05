'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState, Loading, StatCard, Section } from '@/components/atoms';
import { PieDonut, PieLegend, toSegments, type Bucket } from '@/components/charts';
import { FilterBar, FilterSelect, StatStrip } from '@/components/filters';
import { TabbedForm, Field, useTabs } from '@/components/tabbed-form';
import {
	SectorCascade, SportsPicker, TechTagsPicker, RoundTypesPicker, LocationFields, SocialLinks,
	EMPTY_SOCIAL, EMPTY_LOCATION, type SocialValue, type LocationValue,
} from '@/components/entity-pickers';
import { YearSelect } from '@/components/year-select';

interface Investor {
	id: string;
	name: string;
	slug?: string;
	website?: string | null;
	category?: string | null;
	year_launched?: number | null;
	status?: string | null;
	is_verified?: boolean | null;
}

interface InvestorsResponse { data: Investor[]; total: number; totalPages: number }
interface InvestorStats { total: number; verified: number; active: number; by_category: Bucket[]; by_status: Bucket[] }

const CATEGORIES = [
	'venture_capital', 'private_equity', 'financial_services',
	'family_investment_office', 'sovereign_wealth_fund', 'angel', 'other',
] as const;
const STATUSES = ['active', 'inactive', 'paused'] as const;

export default function InvestorsAdminPage() {
	const { mutate } = useSWRConfig();
	const [search, setSearch] = useState('');
	const [category, setCategory] = useState('');
	const [status, setStatus] = useState('');
	const [verified, setVerified] = useState('');
	const [page, setPage] = useState(1);
	const [creating, setCreating] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);

	const { data, error, isLoading } = useSWR<InvestorsResponse>(
		['/api/investors', {
			search: search || undefined, category: category || undefined, status: status || undefined,
			is_verified: verified || undefined, page, limit: 30,
		}],
		{ dedupingInterval: 30_000 },
	);
	const stats = useSWR<InvestorStats>(['/api/admin/stats/investors'], { dedupingInterval: 60_000 });
	const categorySegments = toSegments(stats.data?.by_category ?? []);
	const statusSegments = toSegments(stats.data?.by_status ?? []);

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
			<PageHeader kicker={`Capital · ${(stats.data?.total ?? data?.total ?? 0).toLocaleString()} investors`} title="Investors" />

			<StatStrip cols={4}>
				<StatCard label="Total" loading={stats.isLoading} value={(stats.data?.total ?? 0).toLocaleString()} />
				<StatCard label="Verified" loading={stats.isLoading} value={(stats.data?.verified ?? 0).toLocaleString()} />
				<StatCard label="Actively investing" loading={stats.isLoading} value={(stats.data?.active ?? 0).toLocaleString()} />
				<StatCard label="Categories" loading={stats.isLoading} value={(stats.data?.by_category?.length ?? 0).toLocaleString()} />
			</StatStrip>

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<Section title="By category" meta="investors">
					<AsyncState loading={stats.isLoading} error={stats.error} empty={categorySegments.length === 0} emptyMsg="No data" onRetry={() => void stats.mutate()}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
							<PieDonut segments={categorySegments} size={170} mode="donut" />
							<div style={{ flex: 1, minWidth: 160 }}><PieLegend segments={categorySegments} /></div>
						</div>
					</AsyncState>
				</Section>
				<Section title="By status" meta="investors">
					<AsyncState loading={stats.isLoading} error={stats.error} empty={statusSegments.length === 0} emptyMsg="No data" onRetry={() => void stats.mutate()}>
						<PieDonut segments={statusSegments} mode="bar" />
					</AsyncState>
				</Section>
			</div>

			<FilterBar>
				<input
					className="search-input"
					style={{ flex: '0 0 260px', height: 32 }}
					placeholder="Search investors…"
					value={search}
					onChange={(e) => { setSearch(e.target.value); setPage(1); }}
				/>
				<FilterSelect ariaLabel="Category" value={category} onChange={(v) => { setCategory(v); setPage(1); }} options={[...CATEGORIES]} allLabel="All categories" />
				<FilterSelect ariaLabel="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[...STATUSES]} allLabel="All statuses" />
				<FilterSelect ariaLabel="Verified" value={verified} onChange={(v) => { setVerified(v); setPage(1); }} options={[{ value: 'true', label: 'Verified' }, { value: 'false', label: 'Unverified' }]} allLabel="Any verification" />
				<div style={{ flex: 1 }} />
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add investor</button>
			</FilterBar>

			{(creating || editingId) && (
				<InvestorModal
					id={editingId}
					onClose={() => { setCreating(false); setEditingId(null); }}
					onSaved={() => { setCreating(false); setEditingId(null); void refresh(); }}
				/>
			)}

			<div className="card" style={{ padding: 0, overflow: 'hidden' }}>
				<AsyncState loading={isLoading} error={error} empty={rows.length === 0} emptyMsg={search ? 'No investors match.' : 'No investors yet.'} onRetry={() => void refresh()}>
					<table className="data-table" style={{ width: '100%' }}>
						<thead>
							<tr><th>Name</th><th>Category</th><th>Launched</th><th>Status</th><th>Verified</th><th /></tr>
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
										<button className="btn ghost" onClick={() => setEditingId(r.id)}>Edit</button>
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

interface InvestorForm {
	name: string; slug: string; website: string; description: string;
	category: string; year_launched: string; status: string;
	is_verified: boolean; actively_investing: boolean;
	hq: LocationValue; social: SocialValue;
	keywords: string; logo_url: string;
	num_employees: string; num_investments: string; num_exits: string;
	total_funding: string; annual_revenue: string; analyst_notes: string;
	thesis_sector_ids: string[]; thesis_sport_ids: string[];
	thesis_tech_tag_ids: string[]; thesis_round_type_ids: string[];
}

const EMPTY_INVESTOR: InvestorForm = {
	name: '', slug: '', website: '', description: '', category: '', year_launched: '', status: 'active',
	is_verified: false, actively_investing: false, hq: { ...EMPTY_LOCATION }, social: { ...EMPTY_SOCIAL },
	keywords: '', logo_url: '', num_employees: '', num_investments: '', num_exits: '',
	total_funding: '', annual_revenue: '', analyst_notes: '',
	thesis_sector_ids: [], thesis_sport_ids: [], thesis_tech_tag_ids: [], thesis_round_type_ids: [],
};

interface InvestorEdit extends Investor {
	description?: string | null; hq_country?: string | null; hq_city?: string | null;
	hq_continent?: string | null; hq_region?: string | null; hq_state?: string | null;
	keywords?: string | null; logo_url?: string | null; analyst_notes?: string | null;
	num_employees?: number | null; num_investments?: number | null; num_exits?: number | null;
	total_funding?: string | null; annual_revenue?: string | null; actively_investing?: boolean | null;
	twitter_url?: string | null; instagram_url?: string | null; facebook_url?: string | null;
	linkedin_url?: string | null; youtube_url?: string | null; email?: string | null;
	thesis_sector_ids?: string[]; thesis_sport_ids?: string[]; thesis_tech_tag_ids?: string[]; thesis_round_type_ids?: string[];
}

function toInvestorForm(h: InvestorEdit): InvestorForm {
	return {
		name: h.name ?? '', slug: h.slug ?? '', website: h.website ?? '', description: h.description ?? '',
		category: h.category ?? '', year_launched: h.year_launched ? String(h.year_launched) : '',
		status: h.status ?? 'active', is_verified: !!h.is_verified, actively_investing: !!h.actively_investing,
		hq: { country: h.hq_country ?? '', city: h.hq_city ?? '', continent: h.hq_continent ?? '', region: h.hq_region ?? '', state: h.hq_state ?? '' },
		social: {
			twitter_url: h.twitter_url ?? '', instagram_url: h.instagram_url ?? '', facebook_url: h.facebook_url ?? '',
			linkedin_url: h.linkedin_url ?? '', youtube_url: h.youtube_url ?? '', email: h.email ?? '',
		},
		keywords: h.keywords ?? '', logo_url: h.logo_url ?? '',
		num_employees: h.num_employees != null ? String(h.num_employees) : '',
		num_investments: h.num_investments != null ? String(h.num_investments) : '',
		num_exits: h.num_exits != null ? String(h.num_exits) : '',
		total_funding: h.total_funding ?? '', annual_revenue: h.annual_revenue ?? '', analyst_notes: h.analyst_notes ?? '',
		thesis_sector_ids: h.thesis_sector_ids ?? [], thesis_sport_ids: h.thesis_sport_ids ?? [],
		thesis_tech_tag_ids: h.thesis_tech_tag_ids ?? [], thesis_round_type_ids: h.thesis_round_type_ids ?? [],
	};
}

function InvestorModal({ id, onClose, onSaved }: { id: string | null; onClose: () => void; onSaved: () => void }) {
	const isEdit = !!id;
	const { data: hydrated } = useSWR<InvestorEdit>(isEdit ? [`/api/admin/investors/${id}/edit`] : null, { revalidateOnFocus: false });
	if (isEdit && !hydrated) return <Modal title="Edit investor" onClose={onClose}><Loading msg="Loading investor…" /></Modal>;
	return <InvestorForm id={id} initial={hydrated ? toInvestorForm(hydrated) : EMPTY_INVESTOR} onClose={onClose} onSaved={onSaved} />;
}

function InvestorForm({ id, initial, onClose, onSaved }: { id: string | null; initial: InvestorForm; onClose: () => void; onSaved: () => void }) {
	const isEdit = !!id;
	const [tab, setTab] = useTabs('profile');
	const [form, setForm] = useState<InvestorForm>(initial);
	const [pending, setPending] = useState(false);

	const set = <K extends keyof InvestorForm>(k: K, v: InvestorForm[K]) => setForm((f) => ({ ...f, [k]: v }));
	const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

	const submit = async () => {
		setPending(true);
		try {
			const body: Record<string, unknown> = {
				name: form.name.trim(),
				slug: form.slug.trim() || undefined,
				website: form.website.trim() || null,
				description: form.description.trim() || null,
				category: form.category || null,
				year_launched: numOrNull(form.year_launched),
				status: form.status,
				is_verified: form.is_verified,
				actively_investing: form.actively_investing,
				hq_country: form.hq.country.trim() || undefined,
				hq_city: form.hq.city.trim() || undefined,
				hq_continent: form.hq.continent.trim() || undefined,
				hq_region: form.hq.region.trim() || undefined,
				hq_state: form.hq.state.trim() || undefined,
				keywords: form.keywords.trim() || null,
				logo_url: form.logo_url.trim() || null,
				num_employees: numOrNull(form.num_employees),
				num_investments: numOrNull(form.num_investments),
				num_exits: numOrNull(form.num_exits),
				total_funding: form.total_funding.trim() || null,
				annual_revenue: form.annual_revenue.trim() || null,
				analyst_notes: form.analyst_notes.trim() || null,
				social: form.social,
				thesis_sector_ids: form.thesis_sector_ids,
				thesis_sport_ids: form.thesis_sport_ids,
				thesis_tech_tag_ids: form.thesis_tech_tag_ids,
				thesis_round_type_ids: form.thesis_round_type_ids,
			};
			if (isEdit) await api('PATCH', `/api/admin/investors/${id}`, body);
			else await api('POST', '/api/admin/investors', body);
			toast.success(isEdit ? 'Saved' : 'Created');
			onSaved();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setPending(false);
		}
	};

	const thesisCount = form.thesis_sector_ids.length + form.thesis_sport_ids.length + form.thesis_tech_tag_ids.length + form.thesis_round_type_ids.length;

	return (
		<Modal
			title={isEdit ? 'Edit investor' : 'New investor'}
			onClose={onClose}
			width={680}
			footer={
				<>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={!form.name.trim() || pending} onClick={() => void submit()}>
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
									<Field label={isEdit ? 'Slug' : 'Slug (optional — auto from name)'}><input className="search-input" style={{ fontFamily: 'var(--font-mono)' }} value={form.slug} onChange={(e) => set('slug', e.target.value)} disabled={isEdit} /></Field>
									<Field label="Website"><input className="search-input" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" /></Field>
									<Field label="Description"><textarea className="search-input" style={{ minHeight: 70, resize: 'vertical' }} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
										<Field label="Category">
											<select className="search-input" value={form.category} onChange={(e) => set('category', e.target.value)}>
												<option value="">—</option>
												{CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
											</select>
										</Field>
										<Field label="Launched"><YearSelect value={form.year_launched} onChange={(v) => set('year_launched', v)} /></Field>
									</div>
									<Field label="Status">
										<div style={{ display: 'flex', gap: 6 }}>
											{(['active', 'paused', 'inactive'] as const).map((s) => (
												<button key={s} type="button" className={`chip ${form.status === s ? 'on' : ''}`} onClick={() => set('status', s)}>{s}</button>
											))}
										</div>
									</Field>
									<div style={{ display: 'flex', gap: 16 }}>
										<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
											<input type="checkbox" checked={form.is_verified} onChange={(e) => set('is_verified', e.target.checked)} /> Verified
										</label>
										<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
											<input type="checkbox" checked={form.actively_investing} onChange={(e) => set('actively_investing', e.target.checked)} /> Actively investing
										</label>
									</div>
								</>
							),
						},
						{ key: 'locsocial', label: 'Location & Social', node: (
							<>
								<Field label="Headquarters"><LocationFields value={form.hq} onChange={(v) => set('hq', v)} /></Field>
								<SocialLinks value={form.social} onChange={(v) => set('social', v)} />
							</>
						) },
						{ key: 'thesis', label: 'Thesis', hint: thesisCount, node: (
							<>
								<Field label="Sectors"><SectorCascadeMulti value={form.thesis_sector_ids} onChange={(v) => set('thesis_sector_ids', v)} /></Field>
								<Field label="Sports"><SportsPicker value={form.thesis_sport_ids} onChange={(v) => set('thesis_sport_ids', v)} /></Field>
								<Field label="Tech tags"><TechTagsPicker value={form.thesis_tech_tag_ids} onChange={(v) => set('thesis_tech_tag_ids', v)} /></Field>
								<Field label="Preferred rounds"><RoundTypesPicker value={form.thesis_round_type_ids} onChange={(v) => set('thesis_round_type_ids', v)} /></Field>
							</>
						) },
						{ key: 'stats', label: 'Stats & Notes', node: (
							<>
								<Field label="Keywords"><input className="search-input" value={form.keywords} onChange={(e) => set('keywords', e.target.value)} /></Field>
								<Field label="Logo URL"><input className="search-input" value={form.logo_url} onChange={(e) => set('logo_url', e.target.value)} placeholder="https://" /></Field>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
									<Field label="Employees"><input className="search-input" type="number" value={form.num_employees} onChange={(e) => set('num_employees', e.target.value)} /></Field>
									<Field label="# Investments"><input className="search-input" type="number" value={form.num_investments} onChange={(e) => set('num_investments', e.target.value)} /></Field>
									<Field label="# Exits"><input className="search-input" type="number" value={form.num_exits} onChange={(e) => set('num_exits', e.target.value)} /></Field>
								</div>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
									<Field label="Total funding (USD)"><input className="search-input" value={form.total_funding} onChange={(e) => set('total_funding', e.target.value)} /></Field>
									<Field label="Annual revenue (USD)"><input className="search-input" value={form.annual_revenue} onChange={(e) => set('annual_revenue', e.target.value)} /></Field>
								</div>
								<Field label="Analyst notes"><textarea className="search-input" style={{ minHeight: 70, resize: 'vertical' }} value={form.analyst_notes} onChange={(e) => set('analyst_notes', e.target.value)} /></Field>
							</>
						) },
					]}
				/>
			)}
		</Modal>
	);
}

/**
 * Multi-select sector picker for investor thesis (legacy single-pick cascade
 * picks one node; thesis wants several). Renders the cascade once per chosen id
 * plus an empty cascade to add another.
 */
function SectorCascadeMulti({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
	const setAt = (idx: number, id: string) => {
		const next = [...value];
		if (!id) next.splice(idx, 1);
		else next[idx] = id;
		onChange(Array.from(new Set(next)));
	};
	const addNew = (id: string) => { if (id && !value.includes(id)) onChange([...value, id]); };
	return (
		<div style={{ display: 'grid', gap: 8 }}>
			{value.map((id, idx) => <SectorCascade key={id} value={id} onChange={(v) => setAt(idx, v)} />)}
			<SectorCascade value="" onChange={addNew} />
		</div>
	);
}
