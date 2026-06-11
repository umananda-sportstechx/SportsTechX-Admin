'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/confirm';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState, Loading, StatCard, Section, Pager, SortableTh } from '@/components/atoms';
import { PieDonut, PieLegend, toSegments, type Bucket } from '@/components/charts';
import { FilterBar, FilterSelect, StatStrip } from '@/components/filters';
import { CsvImportButton } from '@/components/csv-import';
import { YearSelect } from '@/components/year-select';
import { ImageInput } from '@/components/image-input';
import { TabbedForm, Field, useTabs } from '@/components/tabbed-form';
import {
	SectorCascade, SportsPicker, TechTagsPicker, LocationFields, SocialLinks,
	EMPTY_SOCIAL, EMPTY_LOCATION, type SocialValue, type LocationValue,
} from '@/components/entity-pickers';
import { DealModal, type StagedDeal } from '../deals/page';
import { AcquisitionModal, type StagedAcq } from '../acquisitions/page';

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
interface CompanyStats { total: number; verified: number; unicorn: number; raising: number; by_status: Bucket[]; by_sector: Bucket[]; by_business_model: Bucket[] }
interface SectorRow { id: string; name: string; slug: string }

const STATUSES = ['active', 'inactive', 'needs_review', 'dead', 'acquired', 'ipo', 'not_sportstech'] as const;
const BUSINESS_MODELS = ['b2b', 'b2c', 'b2b2c', 'd2c', 'b2g', 'other'] as const;

export default function CompaniesAdminPage() {
	const { mutate } = useSWRConfig();
	const ask = useConfirm();
	const [search, setSearch] = useState('');
	const [status, setStatus] = useState('');
	const [sector, setSector] = useState('');
	const [verified, setVerified] = useState('');
	const [page, setPage] = useState(1);
	const [sort, setSort] = useState('-created_at');
	const onSort = (s: string) => { setSort(s); setPage(1); };
	const [creating, setCreating] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [removePending, setRemovePending] = useState(false);

	const { data, error, isLoading } = useSWR<CompaniesResponse>(
		['/api/companies', {
			search: search || undefined, status: status || undefined, sector: sector || undefined,
			is_verified: verified || undefined, page, limit: 30, sort,
		}],
		{ dedupingInterval: 30_000 },
	);
	const stats = useSWR<CompanyStats>(['/api/admin/stats/companies'], { dedupingInterval: 60_000 });
	const sectorOpts = useSWR<SectorRow[]>(['/api/sectors'], { dedupingInterval: 60 * 60_000 });
	const statusSegments = toSegments(stats.data?.by_status ?? []);
	const sectorSegments = toSegments(stats.data?.by_sector ?? []);

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/companies');

	const remove = async (id: string, name: string) => {
		if (!(await ask(`Delete ${name}?`))) return;
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
			<PageHeader kicker={`Database · ${(stats.data?.total ?? data?.total ?? 0).toLocaleString()} companies`} title="Companies" />

			<StatStrip cols={5}>
				<StatCard label="Total" loading={stats.isLoading} value={(stats.data?.total ?? 0).toLocaleString()} />
				<StatCard label="Verified" loading={stats.isLoading} value={(stats.data?.verified ?? 0).toLocaleString()} />
				<StatCard label="Unicorns" loading={stats.isLoading} value={(stats.data?.unicorn ?? 0).toLocaleString()} />
				<StatCard label="Actively raising" loading={stats.isLoading} value={(stats.data?.raising ?? 0).toLocaleString()} urgent={(stats.data?.raising ?? 0) > 0} />
				<StatCard label="Sectors covered" loading={stats.isLoading} value={(stats.data?.by_sector?.length ?? 0).toLocaleString()} />
			</StatStrip>

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<Section title="By status" meta="companies">
					<AsyncState loading={stats.isLoading} error={stats.error} empty={statusSegments.length === 0} emptyMsg="No data" onRetry={() => void stats.mutate()}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
							<PieDonut segments={statusSegments} size={170} mode="donut" />
							<div style={{ flex: 1, minWidth: 160 }}><PieLegend segments={statusSegments} /></div>
						</div>
					</AsyncState>
				</Section>
				<Section title="Top sectors" meta="companies">
					<AsyncState loading={stats.isLoading} error={stats.error} empty={sectorSegments.length === 0} emptyMsg="No data" onRetry={() => void stats.mutate()}>
						<PieDonut segments={sectorSegments} mode="bar" />
					</AsyncState>
				</Section>
			</div>

			<FilterBar>
				<input
					className="search-input"
					style={{ flex: '0 0 280px', height: 32 }}
					placeholder="Search…"
					value={search}
					onChange={(e) => { setSearch(e.target.value); setPage(1); }}
				/>
				<FilterSelect ariaLabel="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[...STATUSES]} allLabel="All statuses" />
				<FilterSelect ariaLabel="Sector" value={sector} onChange={(v) => { setSector(v); setPage(1); }} options={(sectorOpts.data ?? []).map((s) => ({ value: s.slug, label: s.name }))} allLabel="All sectors" />
				<FilterSelect ariaLabel="Verified" value={verified} onChange={(v) => { setVerified(v); setPage(1); }} options={[{ value: 'true', label: 'Verified' }, { value: 'false', label: 'Unverified' }]} allLabel="Any verification" />
				<div style={{ flex: 1 }} />
				<CsvImportButton entity="companies" onDone={() => void refresh()} />
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add company</button>
			</FilterBar>

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
						<thead><tr><SortableTh label="Name" field="name" sort={sort} onSort={onSort} /><th>Slug</th><th>Sector</th><th>HQ</th><th>Status</th><th style={{ textAlign: 'right' }} /></tr></thead>
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
			<Pager page={page} totalPages={data?.totalPages} onPage={setPage} />
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
	poc_first_name: string; poc_last_name: string; poc_job_position: string; poc_email: string; poc_linkedin: string;
	accelerator: string; cohort: string;
}

const EMPTY_COMPANY: CompanyForm = {
	name: '', website: '', slug: '', description: '', custom_logo_url: '',
	sector_id: '', business_model: '', hq: { ...EMPTY_LOCATION },
	founded_year: '', ipo_date: '', status: 'active',
	is_verified: false, is_unicorn: false, is_actively_raising: false,
	social: { ...EMPTY_SOCIAL }, sport_ids: [], tech_tag_ids: [],
	poc_first_name: '', poc_last_name: '', poc_job_position: '', poc_email: '', poc_linkedin: '', accelerator: '', cohort: '',
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
	hq_continent?: string | null; hq_region?: string | null; hq_state?: string | null; hq_report_region?: string | null;
	poc_first_name?: string | null; poc_last_name?: string | null; poc_job_position?: string | null; poc_email?: string | null; poc_linkedin?: string | null;
	accelerator?: string | null; cohort?: string | null;
	sport_ids?: string[]; tech_tag_ids?: string[];
}

function toCompanyForm(h: CompanyEdit): CompanyForm {
	return {
		name: h.name ?? '', website: h.website ?? '', slug: h.slug ?? '', description: h.description ?? '',
		custom_logo_url: h.custom_logo_url ?? '', sector_id: h.sector_id ?? '', business_model: h.business_model ?? '',
		hq: { country: h.hq_country ?? '', city: h.hq_city ?? '', continent: h.hq_continent ?? '', region: h.hq_region ?? '', state: h.hq_state ?? '', report_region: h.hq_report_region ?? '' },
		founded_year: h.founded_year ? String(h.founded_year) : '',
		ipo_date: h.ipo_date ? String(h.ipo_date).slice(0, 10) : '',
		status: h.status ?? 'active', is_verified: !!h.is_verified, is_unicorn: !!h.is_unicorn, is_actively_raising: !!h.is_actively_raising,
		social: {
			twitter_url: h.twitter_url ?? '', instagram_url: h.instagram_url ?? '', facebook_url: h.facebook_url ?? '',
			linkedin_url: h.linkedin_url ?? '', youtube_url: h.youtube_url ?? '', email: h.email ?? '',
		},
		sport_ids: h.sport_ids ?? [], tech_tag_ids: h.tech_tag_ids ?? [],
		poc_first_name: h.poc_first_name ?? '', poc_last_name: h.poc_last_name ?? '', poc_job_position: h.poc_job_position ?? '',
		poc_email: h.poc_email ?? '', poc_linkedin: h.poc_linkedin ?? '', accelerator: h.accelerator ?? '', cohort: h.cohort ?? '',
	};
}

// Outer modal fetches the edit payload (when editing) and only mounts the form
// once data is ready, so the form can seed useState from props directly — no
// setState-in-effect, no cascading renders.
export function CompanyModal({ id, onClose, onSaved, seed }: { id: string | null; onClose: () => void; onSaved: (createdId?: string) => void; seed?: Partial<CompanyForm> }) {
	const isEdit = !!id;
	const { data: hydrated } = useSWR<CompanyEdit>(isEdit ? [`/api/admin/companies/${id}/edit`] : null, { revalidateOnFocus: false });
	if (isEdit && !hydrated) return <Modal title="Edit company" onClose={onClose}><Loading msg="Loading company…" /></Modal>;
	return <CompanyForm id={id} initial={hydrated ? toCompanyForm(hydrated) : { ...EMPTY_COMPANY, ...seed }} onClose={onClose} onSaved={onSaved} />;
}

// ── Funding tab: a company's deals, managed inline via the shared DealModal ──
function CompanyFundingTab({ companyId }: { companyId: string }) {
	const { mutate } = useSWRConfig();
	const ask = useConfirm();
	const { data, isLoading, error } = useSWR<{ data: Array<{ id: string; round_type_name?: string | null; announced_year?: number | null; amount_usd?: string | null; status?: string | null }> }>(
		['/api/deals', { company_id: companyId, limit: 100, sort: '-announced_date' }], { dedupingInterval: 15_000 },
	);
	const [modal, setModal] = useState<{ id: string | null } | null>(null);
	const refresh = () => mutate((k) => Array.isArray(k) && k[0] === '/api/deals');
	const rows = data?.data ?? [];
	const remove = async (dealId: string) => {
		if (!(await ask('Delete this funding round?'))) return;
		try { await api('DELETE', `/api/admin/deals/${dealId}`); toast.success('Deleted'); refresh(); }
		catch (e) { toast.error((e as Error).message); }
	};
	const amt = (v?: string | null) => { const n = Number(v); return v && Number.isFinite(n) && n > 0 ? (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${n.toLocaleString()}`) : 'Undisclosed'; };
	return (
		<div style={{ display: 'grid', gap: 10 }}>
			<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
				<button className="btn" onClick={() => setModal({ id: null })}><Plus size={12} /> Add funding round</button>
			</div>
			<AsyncState loading={isLoading} error={error} empty={rows.length === 0} emptyMsg="No funding rounds yet." onRetry={() => void refresh()}>
				<table className="data-table">
					<thead><tr><th>Round</th><th>Year</th><th>Amount</th><th>Status</th><th /></tr></thead>
					<tbody>
						{rows.map((d) => (
							<tr key={d.id}>
								<td>{d.round_type_name ?? '—'}</td>
								<td className="num">{d.announced_year ?? '—'}</td>
								<td className="num">{amt(d.amount_usd)}</td>
								<td>{d.status ?? '—'}</td>
								<td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
									<button className="btn ghost" onClick={() => setModal({ id: d.id })}>Edit</button>
									<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void remove(d.id)}><Trash2 size={12} /></button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</AsyncState>
			{modal && <DealModal id={modal.id} lockedCompanyId={companyId} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
		</div>
	);
}

// ── M&A tab: acquisitions where this company is acquiree or acquirer ──
function CompanyMaTab({ companyId }: { companyId: string }) {
	const { mutate } = useSWRConfig();
	const ask = useConfirm();
	type Row = { id: string; acquiree_name?: string | null; acquirer_name?: string | null; acquiree_company_id?: string | null; acquisition_year?: number | null; acquisition_type?: string | null };
	const asTarget = useSWR<{ data: Row[] }>(['/api/acquisitions', { acquiree_company_id: companyId, limit: 50 }], { dedupingInterval: 15_000 });
	const asBuyer = useSWR<{ data: Row[] }>(['/api/acquisitions', { acquirer_company_id: companyId, limit: 50 }], { dedupingInterval: 15_000 });
	const [modal, setModal] = useState<{ id: string | null } | null>(null);
	const refresh = () => mutate((k) => Array.isArray(k) && k[0] === '/api/acquisitions');
	const seen = new Set<string>();
	const rows = [...(asTarget.data?.data ?? []), ...(asBuyer.data?.data ?? [])].filter((r) => (seen.has(r.id) ? false : seen.add(r.id)));
	const remove = async (acqId: string) => {
		if (!(await ask('Delete this acquisition?'))) return;
		try { await api('DELETE', `/api/admin/acquisitions/${acqId}`); toast.success('Deleted'); refresh(); }
		catch (e) { toast.error((e as Error).message); }
	};
	return (
		<div style={{ display: 'grid', gap: 10 }}>
			<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
				<button className="btn" onClick={() => setModal({ id: null })}><Plus size={12} /> Add acquisition</button>
			</div>
			<AsyncState loading={asTarget.isLoading || asBuyer.isLoading} error={asTarget.error || asBuyer.error} empty={rows.length === 0} emptyMsg="No acquisitions involving this company." onRetry={() => void refresh()}>
				<table className="data-table">
					<thead><tr><th>Role</th><th>Acquiree</th><th>Acquirer</th><th>Year</th><th /></tr></thead>
					<tbody>
						{rows.map((a) => (
							<tr key={a.id}>
								<td>{a.acquiree_company_id === companyId ? 'Target' : 'Acquirer'}</td>
								<td>{a.acquiree_name ?? '—'}</td>
								<td>{a.acquirer_name ?? '—'}</td>
								<td className="num">{a.acquisition_year ?? '—'}</td>
								<td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
									<button className="btn ghost" onClick={() => setModal({ id: a.id })}>Edit</button>
									<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void remove(a.id)}><Trash2 size={12} /></button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</AsyncState>
			{modal && <AcquisitionModal id={modal.id} onClose={() => setModal(null)} onSaved={() => { setModal(null); refresh(); }} />}
		</div>
	);
}

// ── Staged Funding tab (NEW company): drafts held in parent form state, created
//    atomically alongside the company on save. No company_id exists yet. ──
function StagedFundingTab({ drafts, onChange }: { drafts: StagedDeal[]; onChange: (d: StagedDeal[]) => void }) {
	const [open, setOpen] = useState(false);
	return (
		<div style={{ display: 'grid', gap: 10 }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
				<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{drafts.length} round{drafts.length === 1 ? '' : 's'} staged · saved with the company</div>
				<button className="btn" onClick={() => setOpen(true)}><Plus size={12} /> Add funding round</button>
			</div>
			{drafts.length === 0 ? (
				<div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>No funding rounds yet. Add rounds here — they’ll be created when you save the company.</div>
			) : (
				<table className="data-table">
					<thead><tr><th>Year</th><th>Amount</th><th /></tr></thead>
					<tbody>
						{drafts.map((d, i) => (
							<tr key={i}>
								<td className="num">{d.label.year ?? '—'}</td>
								<td className="num">{d.label.amount ?? '—'}</td>
								<td style={{ textAlign: 'right' }}>
									<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => onChange(drafts.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
			{open && <DealModal id={null} onStage={(d) => onChange([...drafts, d])} onClose={() => setOpen(false)} onSaved={() => setOpen(false)} />}
		</div>
	);
}

// ── Staged M&A tab (NEW company): acquisitions with the new company as acquiree. ──
function StagedMaTab({ drafts, onChange }: { drafts: StagedAcq[]; onChange: (a: StagedAcq[]) => void }) {
	const [open, setOpen] = useState(false);
	return (
		<div style={{ display: 'grid', gap: 10 }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
				<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{drafts.length} acquisition{drafts.length === 1 ? '' : 's'} staged · saved with the company</div>
				<button className="btn" onClick={() => setOpen(true)}><Plus size={12} /> Add acquisition</button>
			</div>
			{drafts.length === 0 ? (
				<div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>No acquisitions yet. Add them here — they’ll be created when you save the company.</div>
			) : (
				<table className="data-table">
					<thead><tr><th>Acquirer</th><th>Year</th><th>Amount</th><th /></tr></thead>
					<tbody>
						{drafts.map((a, i) => (
							<tr key={i}>
								<td>{a.label.acquirer ?? '—'}</td>
								<td className="num">{a.label.year ?? '—'}</td>
								<td className="num">{a.label.amount ?? '—'}</td>
								<td style={{ textAlign: 'right' }}>
									<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => onChange(drafts.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
			{open && <AcquisitionModal id={null} onStage={(a) => onChange([...drafts, a])} onClose={() => setOpen(false)} onSaved={() => setOpen(false)} />}
		</div>
	);
}

function CompanyForm({ id, initial, onClose, onSaved }: { id: string | null; initial: CompanyForm; onClose: () => void; onSaved: (createdId?: string) => void }) {
	const isEdit = !!id;
	const [tab, setTab] = useTabs('profile');
	const [form, setForm] = useState<CompanyForm>(initial);
	const [stagedDeals, setStagedDeals] = useState<StagedDeal[]>([]);
	const [stagedAcqs, setStagedAcqs] = useState<StagedAcq[]>([]);
	const [pending, setPending] = useState(false);

	const set = <K extends keyof CompanyForm>(k: K, v: CompanyForm[K]) => setForm((f) => ({ ...f, [k]: v }));
	const [enriching, setEnriching] = useState(false);
	// Pull name/description/location from Attio by the entered website domain;
	// fills only empty fields so it never clobbers admin edits.
	const enrich = async () => {
		if (!form.website.trim()) { toast.error('Enter a website first.'); return; }
		setEnriching(true);
		try {
			const r = await api<{ found: boolean; data: { name: string | null; description: string | null; website: string | null; city: string | null; country: string | null; logo_url: string | null; founded_year: number | null } | null }>(
				'GET', `/api/admin/integrations/attio/company?domain=${encodeURIComponent(form.website.trim())}`);
			if (!r.found || !r.data) { toast.error('No Attio match for this domain.'); return; }
			const d = r.data;
			setForm((f) => ({
				...f,
				name: f.name.trim() || d.name || f.name,
				description: f.description.trim() || d.description || f.description,
				custom_logo_url: f.custom_logo_url.trim() || d.logo_url || f.custom_logo_url,
				founded_year: f.founded_year || (d.founded_year ? String(d.founded_year) : f.founded_year),
				hq: { ...f.hq, city: f.hq.city.trim() || d.city || f.hq.city, country: f.hq.country.trim() || d.country || f.hq.country },
			}));
			toast.success('Filled empty fields from Attio');
		} catch (e) { toast.error((e as Error).message); } finally { setEnriching(false); }
	};

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
				hq_continent: form.hq.continent.trim() || undefined,
				hq_region: form.hq.region.trim() || undefined,
				hq_state: form.hq.state.trim() || undefined,
					hq_report_region: (form.hq.report_region ?? '').trim() || undefined,
				founded_year: form.founded_year ? Number(form.founded_year) : undefined,
				ipo_date: form.ipo_date || undefined,
				status: form.status,
				is_verified: form.is_verified,
				is_unicorn: form.is_unicorn,
				is_actively_raising: form.is_actively_raising,
				social: form.social,
				sport_ids: form.sport_ids,
				tech_tag_ids: form.tech_tag_ids,
					poc_first_name: form.poc_first_name.trim() || undefined,
					poc_last_name: form.poc_last_name.trim() || undefined,
					poc_job_position: form.poc_job_position.trim() || undefined,
					poc_email: form.poc_email.trim() || undefined,
					poc_linkedin: form.poc_linkedin.trim() || undefined,
					accelerator: form.accelerator.trim() || undefined,
					cohort: form.cohort.trim() || undefined,
				};
			let createdId: string | undefined;
			if (isEdit) await api('PATCH', `/api/admin/companies/${id}`, body);
			else {
				// Carry any funding rounds / acquisitions staged on a brand-new company
				// so they're created in the same atomic request.
				if (stagedDeals.length) body.deals = stagedDeals.map((d) => d.body);
				if (stagedAcqs.length) body.acquisitions = stagedAcqs.map((a) => a.body);
				const created = await api<{ id: string }>('POST', '/api/admin/companies', body);
				createdId = created?.id;
			}
			toast.success(isEdit ? 'Saved' : 'Created');
			onSaved(createdId);
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
									<Field label="Website (required, must be unique)">
										<div style={{ display: 'flex', gap: 6 }}>
											<input className="search-input" type="url" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" style={{ flex: 1 }} />
											<button type="button" className="btn ghost" disabled={enriching || !form.website.trim()} onClick={() => void enrich()} title="Fill empty fields from Attio">{enriching ? 'Enriching…' : 'Enrich'}</button>
										</div>
									</Field>
									<Field label={isEdit ? 'Slug' : 'Slug (optional — auto from name)'}><input className="search-input" style={{ fontFamily: 'var(--font-mono)' }} value={form.slug} onChange={(e) => set('slug', e.target.value)} disabled={isEdit} /></Field>
									<Field label="Description"><textarea className="search-input" style={{ minHeight: 80, resize: 'vertical' }} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
									<Field label="Logo"><ImageInput value={form.custom_logo_url} onChange={(u) => set('custom_logo_url', u)} pathPrefix="companies/logos" /></Field>
									<div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12 }}>
										<Field label="Founded"><YearSelect value={form.founded_year} onChange={(v) => set('founded_year', v)} /></Field>
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
							key: 'contact', label: 'Contact', node: (
								<>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
										<Field label="POC first name"><input className="search-input" value={form.poc_first_name} onChange={(e) => set('poc_first_name', e.target.value)} /></Field>
										<Field label="POC last name"><input className="search-input" value={form.poc_last_name} onChange={(e) => set('poc_last_name', e.target.value)} /></Field>
									</div>
									<Field label="POC job position"><input className="search-input" value={form.poc_job_position} onChange={(e) => set('poc_job_position', e.target.value)} /></Field>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
										<Field label="POC email"><input className="search-input" value={form.poc_email} onChange={(e) => set('poc_email', e.target.value)} placeholder="name@company.com" /></Field>
										<Field label="POC LinkedIn"><input className="search-input" value={form.poc_linkedin} onChange={(e) => set('poc_linkedin', e.target.value)} placeholder="https://linkedin.com/in/…" /></Field>
									</div>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
										<Field label="Accelerator"><input className="search-input" value={form.accelerator} onChange={(e) => set('accelerator', e.target.value)} /></Field>
										<Field label="Cohort"><input className="search-input" value={form.cohort} onChange={(e) => set('cohort', e.target.value)} /></Field>
									</div>
								</>
							),
						},
						...(isEdit && id
							? [
								{ key: 'funding', label: 'Funding', node: <CompanyFundingTab companyId={id} /> },
								{ key: 'ma', label: 'M&A', node: <CompanyMaTab companyId={id} /> },
							]
							: [
								{ key: 'funding', label: 'Funding', hint: stagedDeals.length || undefined, node: <StagedFundingTab drafts={stagedDeals} onChange={setStagedDeals} /> },
								{ key: 'ma', label: 'M&A', hint: stagedAcqs.length || undefined, node: <StagedMaTab drafts={stagedAcqs} onChange={setStagedAcqs} /> },
							]),
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
