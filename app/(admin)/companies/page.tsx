'use client';

import { useState, type CSSProperties } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Save, Trash2, Building2, BadgeCheck, Rocket, Coins, Layers } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useConfirm } from '@/components/confirm';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState, Loading, StatCard, RichStatCard, StatsPanel, Section, Pager, SortableTh } from '@/components/atoms';
import { PieDonut, PieLegend, toSegments, type Bucket } from '@/components/charts';
import { FilterBar, FilterSelect, StatStrip, BoolFilter, FilterRange, RefSlugFilter, SectorTierFilter } from '@/components/filters';
import { CsvImportButton } from '@/components/csv-import';
import { YearSelect } from '@/components/year-select';
import { ImageInput } from '@/components/image-input';
import { TabbedForm, Field, useTabs } from '@/components/tabbed-form';
import {
	SectorCascade, SportsPicker, TechTagsPicker, LocationFields, SocialLinks,
	RoundTypeSelect, CurrencySelect, InvestorPicker, CompanySelectOne,
	EMPTY_SOCIAL, EMPTY_LOCATION, type SocialValue, type LocationValue, type DealInvestor,
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
interface CompanyStats { total: number; verified: number; unicorn: number; raising: number; total_rows?: number; this_year?: number; last_year?: number; yoy_change?: number | null; by_status: Bucket[]; by_sector: Bucket[]; by_business_model: Bucket[] }

const STATUSES = ['active', 'inactive', 'needs_review', 'dead', 'acquired', 'ipo', 'not_sportstech'] as const;
// d2c/b2g/other dropped - unused across all records (verified) and not wanted.
const BUSINESS_MODELS = ['b2b', 'b2c', 'b2b2c'] as const;

export function CompaniesView({ embedded = false }: { embedded?: boolean }) {
	const { mutate } = useSWRConfig();
	const ask = useConfirm();
	const [search, setSearch] = useState('');
	const debouncedSearch = useDebouncedValue(search);
	const [status, setStatus] = useState('');
	const [sector, setSector] = useState('');
	const [verified, setVerified] = useState('');
	const [sport, setSport] = useState('');
	const [country, setCountry] = useState('');
	const [raising, setRaising] = useState('');
	const [unicorn, setUnicorn] = useState('');
	const [foundedMin, setFoundedMin] = useState('');
	const [foundedMax, setFoundedMax] = useState('');
	const [fundingMin, setFundingMin] = useState('');
	const [fundingMax, setFundingMax] = useState('');
	const [page, setPage] = useState(1);
	const [sort, setSort] = useState('-created_at');
	const onSort = (s: string) => { setSort(s); setPage(1); };
	const reset1 = () => setPage(1);
	const [creating, setCreating] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [removePending, setRemovePending] = useState(false);

	const { data, error, isLoading } = useSWR<CompaniesResponse>(
		['/api/companies', {
			search: debouncedSearch || undefined, status: status || undefined, sector: sector || undefined,
			is_verified: verified || undefined, sport: sport || undefined, country: country.trim() || undefined,
			is_actively_raising: raising || undefined, is_unicorn: unicorn || undefined,
			founded_year_min: foundedMin || undefined, founded_year_max: foundedMax || undefined,
			min_funding: fundingMin || undefined, max_funding: fundingMax || undefined,
			page, limit: 30, sort,
		}],
		{ dedupingInterval: 30_000 },
	);
	const stats = useSWR<CompanyStats>(['/api/admin/stats/companies'], { dedupingInterval: 60_000 });
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
			{!embedded && <PageHeader kicker={`Database · ${(stats.data?.total ?? data?.total ?? 0).toLocaleString()} companies`} title="Companies" />}

			<StatsPanel>
				<StatStrip cols={5}>
					<RichStatCard label="Total Companies" Icon={Building2} loading={stats.isLoading} value={(stats.data?.total ?? 0).toLocaleString()}
						totalRows={stats.data?.total_rows} thisYear={stats.data?.this_year} lastYear={stats.data?.last_year} yoy={stats.data?.yoy_change} />
					<RichStatCard label="Verified" Icon={BadgeCheck} loading={stats.isLoading} value={(stats.data?.verified ?? 0).toLocaleString()} />
					<RichStatCard label="Unicorns" Icon={Rocket} loading={stats.isLoading} value={(stats.data?.unicorn ?? 0).toLocaleString()} />
					<RichStatCard label="Actively raising" Icon={Coins} loading={stats.isLoading} value={(stats.data?.raising ?? 0).toLocaleString()} />
					<RichStatCard label="Sectors covered" Icon={Layers} loading={stats.isLoading} value={(stats.data?.by_sector?.length ?? 0).toLocaleString()} />
				</StatStrip>
			</StatsPanel>

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<Section title="By status" meta="companies" center>
					<AsyncState loading={stats.isLoading} error={stats.error} empty={statusSegments.length === 0} emptyMsg="No data" onRetry={() => void stats.mutate()}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
							<PieDonut segments={statusSegments} size={170} mode="donut" />
							<div style={{ flex: 1, minWidth: 160 }}><PieLegend segments={statusSegments} /></div>
						</div>
					</AsyncState>
				</Section>
				<Section title="Top sectors" meta="companies" center>
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
				<FilterSelect ariaLabel="Status" value={status} onChange={(v) => { setStatus(v); reset1(); }} options={[...STATUSES]} allLabel="All statuses" />
				<SectorTierFilter value={sector} onChange={(v) => { setSector(v); reset1(); }} allTopLabel="All sectors" />
				<RefSlugFilter kind="sports" ariaLabel="Sport" value={sport} onChange={(v) => { setSport(v); reset1(); }} allLabel="All sports" />
				<FilterSelect ariaLabel="Verified" value={verified} onChange={(v) => { setVerified(v); reset1(); }} options={[{ value: 'true', label: 'Verified' }, { value: 'false', label: 'Unverified' }]} allLabel="Any verification" />
				<input className="search-input" style={{ height: 32, width: 130 }} placeholder="Country" value={country} onChange={(e) => { setCountry(e.target.value); reset1(); }} />
				<BoolFilter ariaLabel="Actively raising" value={raising} onChange={(v) => { setRaising(v); reset1(); }} yesLabel="Raising" noLabel="Not raising" allLabel="Any raising" />
				<BoolFilter ariaLabel="Unicorn" value={unicorn} onChange={(v) => { setUnicorn(v); reset1(); }} yesLabel="Unicorn" noLabel="Non-unicorn" allLabel="Any size" />
				<FilterRange label="Founded" min={foundedMin} max={foundedMax} onMin={(v) => { setFoundedMin(v); reset1(); }} onMax={(v) => { setFoundedMax(v); reset1(); }} width={64} />
				<FilterRange label="Funding $" min={fundingMin} max={fundingMax} onMin={(v) => { setFundingMin(v); reset1(); }} onMax={(v) => { setFundingMax(v); reset1(); }} />
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
	raising_amount: string; raising_round: string; raising_valuation: string; raising_pitch_deck_url: string;
	social: SocialValue;
	sport_ids: string[];
	tech_tag_ids: string[];
	poc_first_name: string; poc_last_name: string; poc_job_position: string; poc_email: string; poc_linkedin: string;
	poc_personal_email: string; poc_personal_linkedin: string;
	accelerator: string; cohort: string;
}

const EMPTY_COMPANY: CompanyForm = {
	name: '', website: '', slug: '', description: '', custom_logo_url: '',
	sector_id: '', business_model: '', hq: { ...EMPTY_LOCATION },
	founded_year: '', ipo_date: '', status: 'active',
	is_verified: false, is_unicorn: false, is_actively_raising: false,
	raising_amount: '', raising_round: '', raising_valuation: '', raising_pitch_deck_url: '',
	social: { ...EMPTY_SOCIAL }, sport_ids: [], tech_tag_ids: [],
	poc_first_name: '', poc_last_name: '', poc_job_position: '', poc_email: '', poc_linkedin: '', poc_personal_email: '', poc_personal_linkedin: '', accelerator: '', cohort: '',
};

interface CompanyEdit extends Company {
	custom_logo_url?: string | null;
	business_model?: string | null;
	ipo_date?: string | null;
	is_verified?: boolean;
	is_unicorn?: boolean;
	is_actively_raising?: boolean;
	actively_raising_amount?: string | number | null; actively_raising_round?: string | null;
	actively_raising_valuation?: string | number | null; actively_raising_pitch_deck_url?: string | null;
	twitter_url?: string | null; instagram_url?: string | null; facebook_url?: string | null;
	linkedin_url?: string | null; youtube_url?: string | null; email?: string | null;
	hq_continent?: string | null; hq_region?: string | null; hq_state?: string | null; hq_report_region?: string | null;
	poc_first_name?: string | null; poc_last_name?: string | null; poc_job_position?: string | null; poc_email?: string | null; poc_linkedin?: string | null;
	poc_personal_email?: string | null; poc_personal_linkedin?: string | null;
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
		raising_amount: h.actively_raising_amount != null ? String(h.actively_raising_amount) : '',
		raising_round: h.actively_raising_round ?? '',
		raising_valuation: h.actively_raising_valuation != null ? String(h.actively_raising_valuation) : '',
		raising_pitch_deck_url: h.actively_raising_pitch_deck_url ?? '',
		social: {
			twitter_url: h.twitter_url ?? '', instagram_url: h.instagram_url ?? '', facebook_url: h.facebook_url ?? '',
			linkedin_url: h.linkedin_url ?? '', youtube_url: h.youtube_url ?? '', email: h.email ?? '',
		},
		sport_ids: h.sport_ids ?? [], tech_tag_ids: h.tech_tag_ids ?? [],
		poc_first_name: h.poc_first_name ?? '', poc_last_name: h.poc_last_name ?? '', poc_job_position: h.poc_job_position ?? '',
		poc_email: h.poc_email ?? '', poc_linkedin: h.poc_linkedin ?? '', poc_personal_email: h.poc_personal_email ?? '', poc_personal_linkedin: h.poc_personal_linkedin ?? '', accelerator: h.accelerator ?? '', cohort: h.cohort ?? '',
	};
}

// Outer modal fetches the edit payload (when editing) and only mounts the form
// once data is ready, so the form can seed useState from props directly — no
// setState-in-effect, no cascading renders.
export function CompanyModal({ id, onClose, onSaved, seed, promotePipelineId }: { id: string | null; onClose: () => void; onSaved: (createdId?: string) => void; seed?: Partial<CompanyForm>; promotePipelineId?: string }) {
	const isEdit = !!id;
	const { data: hydrated } = useSWR<CompanyEdit>(isEdit ? [`/api/admin/companies/${id}/edit`] : null, { revalidateOnFocus: false });
	if (isEdit && !hydrated) return <Modal title="Edit company" onClose={onClose}><Loading msg="Loading company…" /></Modal>;
	return <CompanyForm id={id} initial={hydrated ? toCompanyForm(hydrated) : { ...EMPTY_COMPANY, ...seed }} onClose={onClose} onSaved={onSaved} promotePipelineId={promotePipelineId} />;
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

// ── Staged Funding / M&A tabs (NEW company) ──────────────────────────────────
// Drafts are held in parent form state and created atomically alongside the
// company on save (no company_id exists yet). The "Add" action expands an
// inline editor in place — no child modal — matching the legacy admin's flow.

const DEAL_STATUSES = ['active', 'inactive', 'not_sportstech', 'website_error'] as const;
const SIZE_BUCKETS = ['under_1m', 'from_1m_to_10m', 'from_10m_to_100m', 'over_100m'] as const;
const ACQ_TYPES = ['acquisition', 'merger', 'asset_purchase'] as const;
const PARTY_MODELS = ['b2b', 'b2c', 'b2b2c'] as const;

function fmtStagedAmount(v: string): string {
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return '—';
	if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
	if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
	if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
	return `$${n}`;
}

const editorBox: CSSProperties = { border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'grid', gap: 12, background: 'var(--bg-2)' };

interface PartyForm { is_sportstech: boolean; sector_id: string; business_model: string; hq: LocationValue; sport_ids: string[] }
const emptyParty = (): PartyForm => ({ is_sportstech: false, sector_id: '', business_model: '', hq: { ...EMPTY_LOCATION }, sport_ids: [] });

function StagedFundingTab({ drafts, onChange }: { drafts: StagedDeal[]; onChange: (d: StagedDeal[]) => void }) {
	const [open, setOpen] = useState(false);
	return (
		<div style={{ display: 'grid', gap: 10 }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
				<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{drafts.length} round{drafts.length === 1 ? '' : 's'} staged · saved with the company</div>
				{!open && <button className="btn" onClick={() => setOpen(true)}><Plus size={12} /> Add funding round</button>}
			</div>
			{drafts.length === 0 ? (
				<div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>No funding rounds yet. Add rounds here — they’ll be created when you save the company.</div>
			) : (
				<table className="data-table">
					<thead><tr><th>Round</th><th>Year</th><th>Amount</th><th /></tr></thead>
					<tbody>
						{drafts.map((d, i) => (
							<tr key={i}>
								<td>{d.label.round ?? '—'}</td>
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
			{open && <InlineFundingEditor onStage={(d) => { onChange([...drafts, d]); setOpen(false); }} onCancel={() => setOpen(false)} />}
		</div>
	);
}

function InlineFundingEditor({ onStage, onCancel }: { onStage: (d: StagedDeal) => void; onCancel: () => void }) {
	const [roundTypeId, setRoundTypeId] = useState('');
	const [date, setDate] = useState('');
	const [amount, setAmount] = useState('');
	const [currency, setCurrency] = useState('');
	const [bucket, setBucket] = useState('');
	const [status, setStatus] = useState('active');
	const [sectorId, setSectorId] = useState('');
	const [model, setModel] = useState('');
	const [sourceUrl, setSourceUrl] = useState('');
	const [txnUrl, setTxnUrl] = useState('');
	const [hq, setHq] = useState<LocationValue>({ ...EMPTY_LOCATION });
	const [sportIds, setSportIds] = useState<string[]>([]);
	const [investors, setInvestors] = useState<DealInvestor[]>([]);

	const add = () => {
		const body: Record<string, unknown> = {
			round_type_id: roundTypeId || undefined,
			announced_date: date || undefined,
			amount: amount.trim() ? Number(amount) : undefined,
			currency_code: currency || undefined,
			deal_size_bucket: bucket || undefined,
			status,
			sector_id: sectorId || undefined,
			business_model: model || undefined,
			source_url: sourceUrl.trim() || undefined,
			transaction_url: txnUrl.trim() || undefined,
			hq_country: hq.country.trim() || undefined,
			hq_city: hq.city.trim() || undefined,
			hq_continent: hq.continent.trim() || undefined,
			hq_region: hq.region.trim() || undefined,
			hq_state: hq.state.trim() || undefined,
			sport_ids: sportIds,
			investors,
		};
		onStage({ body, label: { amount: amount.trim() ? fmtStagedAmount(amount) : undefined, year: date ? date.slice(0, 4) : undefined } });
	};

	return (
		<div style={editorBox}>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
				<Field label="Round type"><RoundTypeSelect value={roundTypeId} onChange={setRoundTypeId} /></Field>
				<Field label="Announced date"><input className="search-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
			</div>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr', gap: 12 }}>
				<Field label="Amount"><input className="search-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="in currency" /></Field>
				<Field label="Currency"><CurrencySelect value={currency} onChange={setCurrency} /></Field>
				<Field label="Size bucket">
					<select className="search-input" value={bucket} onChange={(e) => setBucket(e.target.value)}>
						<option value="">—</option>
						{SIZE_BUCKETS.map((b) => <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>)}
					</select>
				</Field>
			</div>
			<Field label="Investors" hint="star marks the lead"><InvestorPicker value={investors} onChange={setInvestors} /></Field>
			<Field label="Sector"><SectorCascade value={sectorId} onChange={setSectorId} /></Field>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
				<Field label="Business model">
					<select className="search-input" value={model} onChange={(e) => setModel(e.target.value)}>
						<option value="">—</option>
						{PARTY_MODELS.map((b) => <option key={b} value={b}>{b.toUpperCase()}</option>)}
					</select>
				</Field>
				<Field label="Status">
					<select className="search-input" value={status} onChange={(e) => setStatus(e.target.value)}>
						{DEAL_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
					</select>
				</Field>
			</div>
			<Field label="Location"><LocationFields value={hq} onChange={setHq} /></Field>
			<Field label="Sports"><SportsPicker value={sportIds} onChange={setSportIds} /></Field>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
				<Field label="Source URL"><input className="search-input" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" /></Field>
				<Field label="Transaction URL"><input className="search-input" value={txnUrl} onChange={(e) => setTxnUrl(e.target.value)} placeholder="https://" /></Field>
			</div>
			<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
				<button className="btn ghost" onClick={onCancel}>Cancel</button>
				<button className="btn" onClick={add}><Plus size={12} /> Add round</button>
			</div>
		</div>
	);
}

function StagedMaTab({ drafts, onChange }: { drafts: StagedAcq[]; onChange: (a: StagedAcq[]) => void }) {
	const [open, setOpen] = useState(false);
	return (
		<div style={{ display: 'grid', gap: 10 }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
				<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{drafts.length} acquisition{drafts.length === 1 ? '' : 's'} staged · saved with the company</div>
				{!open && <button className="btn" onClick={() => setOpen(true)}><Plus size={12} /> Add acquisition</button>}
			</div>
			{drafts.length === 0 ? (
				<div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>No acquisitions yet. Choose whether this company was the acquirer or the acquiree, then add the other party.</div>
			) : (
				<table className="data-table">
					<thead><tr><th>This company</th><th>Counterparty</th><th>Year</th><th>Amount</th><th /></tr></thead>
					<tbody>
						{drafts.map((a, i) => (
							<tr key={i}>
								<td>{a.label.role === 'acquirer' ? 'Acquirer' : 'Acquiree'}</td>
								<td>{a.label.counterparty ?? a.label.acquirer ?? '—'}</td>
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
			{open && <InlineMaEditor onStage={(a) => { onChange([...drafts, a]); setOpen(false); }} onCancel={() => setOpen(false)} />}
		</div>
	);
}

function InlineMaEditor({ onStage, onCancel }: { onStage: (a: StagedAcq) => void; onCancel: () => void }) {
	const [role, setRole] = useState<'acquiree' | 'acquirer'>('acquiree');
	const [cpId, setCpId] = useState('');        // counterparty company (the other side)
	const [cpName, setCpName] = useState('');    // counterparty free-text name / display
	const [party, setParty] = useState<PartyForm>(emptyParty());
	const [date, setDate] = useState('');
	const [amount, setAmount] = useState('');
	const [currency, setCurrency] = useState('');
	const [type, setType] = useState('acquisition');
	const [sourceUrl, setSourceUrl] = useState('');

	// The new company's role; the counterparty fills the *opposite* side's columns.
	const opposite = role === 'acquiree' ? 'acquirer' : 'acquiree';
	const cpLabel = role === 'acquiree' ? 'Acquiring company (acquirer)' : 'Acquired company (acquiree)';

	const pickCounterparty = (id: string) => {
		setCpId(id);
		if (!id) return;
		// Auto-fill the counterparty's classification/location from its catalog record.
		void (async () => {
			try {
				const c = await api<{ name?: string; sector_id?: string | null; business_model?: string | null; hq_country?: string | null; hq_city?: string | null; hq_continent?: string | null; hq_region?: string | null; hq_state?: string | null; sport_ids?: string[] }>('GET', `/api/admin/companies/${id}/edit`);
				setCpName(c.name ?? '');
				setParty((p) => ({
					...p,
					sector_id: c.sector_id ?? '',
					business_model: c.business_model ?? '',
					hq: { country: c.hq_country ?? '', city: c.hq_city ?? '', continent: c.hq_continent ?? '', region: c.hq_region ?? '', state: c.hq_state ?? '' },
					sport_ids: c.sport_ids ?? [],
				}));
			} catch { /* leave fields for manual entry */ }
		})();
	};

	const canAdd = !!cpId || !!cpName.trim();
	const add = () => {
		const body: Record<string, unknown> = {
			_role: role,
			acquisition_date: date || undefined,
			amount: amount.trim() ? Number(amount) : undefined,
			currency_code: currency || undefined,
			acquisition_type: type,
			source_url: sourceUrl.trim() || undefined,
			[`${opposite}_company_id`]: cpId || undefined,
			[`${opposite}_name`]: !cpId && cpName.trim() ? cpName.trim() : undefined,
			[`${opposite}_is_sportstech`]: party.is_sportstech,
			[`${opposite}_sector_id`]: party.sector_id || undefined,
			[`${opposite}_business_model`]: party.business_model || undefined,
			[`${opposite}_hq_country`]: party.hq.country.trim() || undefined,
			[`${opposite}_hq_city`]: party.hq.city.trim() || undefined,
			[`${opposite}_hq_continent`]: party.hq.continent.trim() || undefined,
			[`${opposite}_hq_region`]: party.hq.region.trim() || undefined,
			[`${opposite}_hq_state`]: party.hq.state.trim() || undefined,
			[`${opposite}_sport_ids`]: party.sport_ids,
		};
		onStage({ body, label: { counterparty: cpName.trim() || undefined, role, amount: amount.trim() ? fmtStagedAmount(amount) : undefined, year: date ? date.slice(0, 4) : undefined } });
	};

	const roleBtn = (r: 'acquiree' | 'acquirer', title: string, sub: string) => (
		<button type="button" onClick={() => setRole(r)}
			style={{
				flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
				border: `1px solid ${role === r ? 'var(--accent)' : 'var(--border)'}`,
				background: role === r ? 'var(--bg-3)' : 'transparent',
			}}>
			<div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div>
			<div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{sub}</div>
		</button>
	);

	return (
		<div style={editorBox}>
			<div>
				<div className="co-stat-label" style={{ marginBottom: 6 }}>Is this company the acquirer or the acquiree?</div>
				<div style={{ display: 'flex', gap: 8 }}>
					{roleBtn('acquirer', 'Acquirer', 'This company acquired another')}
					{roleBtn('acquiree', 'Acquiree', 'This company was acquired')}
				</div>
			</div>
			<Field label={cpLabel} hint="search the catalog to auto-fill, or type a name">
				<CompanySelectOne value={cpId} onChange={pickCounterparty} placeholder={`Search the ${opposite}…`} />
			</Field>
			{!cpId && (
				<Field label="…or counterparty name (free text)"><input className="search-input" value={cpName} onChange={(e) => setCpName(e.target.value)} placeholder="Name of the other company" /></Field>
			)}
			<Field label="Counterparty sector"><SectorCascade value={party.sector_id} onChange={(v) => setParty((p) => ({ ...p, sector_id: v }))} /></Field>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
				<Field label="Counterparty business model">
					<select className="search-input" value={party.business_model} onChange={(e) => setParty((p) => ({ ...p, business_model: e.target.value }))}>
						<option value="">—</option>
						{PARTY_MODELS.map((b) => <option key={b} value={b}>{b.toUpperCase()}</option>)}
					</select>
				</Field>
				<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, alignSelf: 'end', paddingBottom: 8 }}>
					<input type="checkbox" checked={party.is_sportstech} onChange={(e) => setParty((p) => ({ ...p, is_sportstech: e.target.checked }))} /> Counterparty is SportsTech
				</label>
			</div>
			<Field label="Counterparty location"><LocationFields value={party.hq} onChange={(v) => setParty((p) => ({ ...p, hq: v }))} /></Field>
			<Field label="Counterparty sports"><SportsPicker value={party.sport_ids} onChange={(v) => setParty((p) => ({ ...p, sport_ids: v }))} /></Field>
			<div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'grid', gap: 12 }}>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
					<Field label="Acquisition date"><input className="search-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
					<Field label="Type">
						<select className="search-input" value={type} onChange={(e) => setType(e.target.value)}>
							{ACQ_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
						</select>
					</Field>
				</div>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
					<Field label="Amount"><input className="search-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="in currency" /></Field>
					<Field label="Currency"><CurrencySelect value={currency} onChange={setCurrency} /></Field>
				</div>
				<Field label="Source URL"><input className="search-input" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://" /></Field>
			</div>
			<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
				<button className="btn ghost" onClick={onCancel}>Cancel</button>
				<button className="btn" disabled={!canAdd} onClick={add}><Plus size={12} /> Add acquisition</button>
			</div>
		</div>
	);
}

function CompanyForm({ id, initial, onClose, onSaved, promotePipelineId }: { id: string | null; initial: CompanyForm; onClose: () => void; onSaved: (createdId?: string) => void; promotePipelineId?: string }) {
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
				actively_raising_amount: form.raising_amount.trim() ? Number(form.raising_amount) : undefined,
				actively_raising_round: form.raising_round.trim() || undefined,
				actively_raising_valuation: form.raising_valuation.trim() ? Number(form.raising_valuation) : undefined,
				actively_raising_pitch_deck_url: form.raising_pitch_deck_url.trim() || undefined,
				social: form.social,
				sport_ids: form.sport_ids,
				tech_tag_ids: form.tech_tag_ids,
					poc_first_name: form.poc_first_name.trim() || undefined,
					poc_last_name: form.poc_last_name.trim() || undefined,
					poc_job_position: form.poc_job_position.trim() || undefined,
					poc_email: form.poc_email.trim() || undefined,
					poc_linkedin: form.poc_linkedin.trim() || undefined,
					poc_personal_email: form.poc_personal_email.trim() || undefined,
					poc_personal_linkedin: form.poc_personal_linkedin.trim() || undefined,
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
				// Promote-from-queue: link the pipeline row in the same create tx.
				if (promotePipelineId) body.pipeline_id = promotePipelineId;
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
										<Field label="POC email (company)"><input className="search-input" value={form.poc_email} onChange={(e) => set('poc_email', e.target.value)} placeholder="name@company.com" /></Field>
										<Field label="POC LinkedIn (company)"><input className="search-input" value={form.poc_linkedin} onChange={(e) => set('poc_linkedin', e.target.value)} placeholder="https://linkedin.com/in/…" /></Field>
									</div>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
										<Field label="POC personal email"><input className="search-input" value={form.poc_personal_email} onChange={(e) => set('poc_personal_email', e.target.value)} placeholder="personal@email.com" /></Field>
										<Field label="POC personal LinkedIn"><input className="search-input" value={form.poc_personal_linkedin} onChange={(e) => set('poc_personal_linkedin', e.target.value)} placeholder="https://linkedin.com/in/…" /></Field>
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
									{form.is_actively_raising && (
										<div style={{ display: 'grid', gap: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg-2)' }}>
											<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
												<Field label="Raising amount ($)"><input className="search-input" type="number" value={form.raising_amount} onChange={(e) => set('raising_amount', e.target.value)} placeholder="target raise" /></Field>
												<Field label="Round"><input className="search-input" value={form.raising_round} onChange={(e) => set('raising_round', e.target.value)} placeholder="e.g. Series A" /></Field>
											</div>
											<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
												<Field label="Valuation ($)"><input className="search-input" type="number" value={form.raising_valuation} onChange={(e) => set('raising_valuation', e.target.value)} placeholder="pre/post" /></Field>
												<Field label="Pitch deck URL"><input className="search-input" value={form.raising_pitch_deck_url} onChange={(e) => set('raising_pitch_deck_url', e.target.value)} placeholder="https://" /></Field>
											</div>
										</div>
									)}
								</>
							),
						},
					]}
				/>
			)}
		</Modal>
	);
}

export default function CompaniesAdminPage() { return <CompaniesView />; }
