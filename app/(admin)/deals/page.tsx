'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useConfirm } from '@/components/confirm';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState, Loading, StatCard, Section, Pager, SortableTh } from '@/components/atoms';
import { ComboBarLine, PieDonut, PieLegend, toSegments, type Bucket } from '@/components/charts';
import { FilterBar, FilterSelect, StatStrip, FilterRange, RefSlugFilter, SectorTierFilter } from '@/components/filters';
import { CsvImportButton } from '@/components/csv-import';
import { TabbedForm, Field, useTabs } from '@/components/tabbed-form';
import {
	CompanySelectOne, SectorCascade, SportsPicker, RoundTypeSelect, CurrencySelect, InvestorPicker, LocationFields,
	EMPTY_LOCATION, type DealInvestor, type LocationValue,
} from '@/components/entity-pickers';

interface Deal {
	id: string;
	company_name?: string | null;
	round_type_name?: string | null;
	announced_year?: number | null;
	announced_date?: string | null;
	amount_usd?: string | null;
	currency_code?: string | null;
	status?: string | null;
	primary_sector?: string | null;
}
interface DealsResponse { data: Deal[]; total: number; totalPages: number }
interface DealStats { total: number; total_amount: number; by_year: Array<{ year: number; deals: number; amt: number }>; by_round_type: Bucket[]; by_size_bucket: Bucket[] }

const STATUSES = ['active', 'inactive', 'not_sportstech', 'website_error'] as const;
// d2c/b2g/other dropped - unused across all records (verified) and not wanted.
const BUSINESS_MODELS = ['b2b', 'b2c', 'b2b2c'] as const;
const SIZE_BUCKETS = ['under_1m', 'from_1m_to_10m', 'from_10m_to_100m', 'over_100m'] as const;

function fmtAmount(v?: string | null): string {
	if (!v) return '—';
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return 'Undisclosed';
	if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
	if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
	if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
	return `$${n}`;
}
const fmtMoney = (n: number): string => n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${(n / 1e6).toFixed(1)}M`;

export function DealsView({ embedded = false }: { embedded?: boolean }) {
	const { mutate } = useSWRConfig();
	const ask = useConfirm();
	const [search, setSearch] = useState('');
	const debouncedSearch = useDebouncedValue(search);
	const [status, setStatus] = useState('');
	const [businessModel, setBusinessModel] = useState('');
	const [sizeBucket, setSizeBucket] = useState('');
	const [year, setYear] = useState('');
	const [sector, setSector] = useState('');
	const [sport, setSport] = useState('');
	const [roundType, setRoundType] = useState('');
	const [amountMin, setAmountMin] = useState('');
	const [amountMax, setAmountMax] = useState('');
	const [disclosed, setDisclosed] = useState('');
	const [page, setPage] = useState(1);
	const [sort, setSort] = useState('-announced_date');
	const onSort = (s: string) => { setSort(s); setPage(1); };
	const reset1 = () => setPage(1);
	const [creating, setCreating] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);

	const { data, error, isLoading } = useSWR<DealsResponse>(
		['/api/deals', {
			q: debouncedSearch || undefined, status: status || undefined, business_model: businessModel || undefined,
			deal_size_bucket: sizeBucket || undefined, year: year || undefined,
			sector_slug: sector || undefined, sport_slug: sport || undefined, round_type_slug: roundType || undefined,
			amount_usd_min: amountMin || undefined, amount_usd_max: amountMax || undefined, disclosed_only: disclosed || undefined,
			page, limit: 30, sort,
		}],
		{ dedupingInterval: 30_000 },
	);
	const stats = useSWR<DealStats>(['/api/admin/stats/deals'], { dedupingInterval: 60_000 });
	const yearChart = (stats.data?.by_year ?? []).map((r) => ({ year: r.year, amt: Number(r.amt), deals: Number(r.deals) }));
	const sizeSegments = toSegments(stats.data?.by_size_bucket ?? []);
	const yearOpts = (stats.data?.by_year ?? []).map((r) => String(r.year)).reverse();
	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/deals');

	const remove = async (id: string) => {
		if (!(await ask('Delete this deal?'))) return;
		try {
			await api('DELETE', `/api/admin/deals/${id}`);
			toast.success('Deleted');
			void refresh();
		} catch (e) { toast.error((e as Error).message); }
	};

	const deals = data?.data ?? [];
	return (
		<div>
			{!embedded && <PageHeader kicker={`Funding · ${(stats.data?.total ?? data?.total ?? 0).toLocaleString()} deals`} title="Deals" />}

			<StatStrip cols={3}>
				<StatCard label="Total deals" loading={stats.isLoading} value={(stats.data?.total ?? 0).toLocaleString()} />
				<StatCard label="Total funding (disclosed)" loading={stats.isLoading} value={fmtMoney(stats.data?.total_amount ?? 0)} />
				<StatCard label="Latest year deals" loading={stats.isLoading} value={(yearChart[yearChart.length - 1]?.deals ?? 0).toLocaleString()} />
			</StatStrip>

			<div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<Section title="Funding by year" meta="amount · deals" center>
					<AsyncState loading={stats.isLoading} error={stats.error} empty={yearChart.length === 0} emptyMsg="No data" onRetry={() => void stats.mutate()}>
						<ComboBarLine data={yearChart} height={240} valueFormatter={fmtMoney} barLabel="Funding" lineLabel="deals" />
					</AsyncState>
				</Section>
				<Section title="By deal size" meta="deals" center>
					<AsyncState loading={stats.isLoading} error={stats.error} empty={sizeSegments.length === 0} emptyMsg="No data" onRetry={() => void stats.mutate()}>
						<div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
							<PieDonut segments={sizeSegments} size={170} mode="donut" />
							<PieLegend segments={sizeSegments} />
						</div>
					</AsyncState>
				</Section>
			</div>

			<FilterBar>
				<input className="search-input" style={{ flex: '0 0 260px', height: 32 }} placeholder="Search by company…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
				<FilterSelect ariaLabel="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[...STATUSES]} allLabel="All statuses" />
				<FilterSelect ariaLabel="Business model" value={businessModel} onChange={(v) => { setBusinessModel(v); setPage(1); }} options={[...BUSINESS_MODELS]} allLabel="All models" />
				<FilterSelect ariaLabel="Deal size" value={sizeBucket} onChange={(v) => { setSizeBucket(v); setPage(1); }} options={SIZE_BUCKETS.map((s) => ({ value: s, label: s.replace(/_/g, ' ').replace('from ', '').replace('to', '–') }))} allLabel="Any size" />
				<FilterSelect ariaLabel="Year" value={year} onChange={(v) => { setYear(v); reset1(); }} options={yearOpts} allLabel="All years" />
				<SectorTierFilter value={sector} onChange={(v) => { setSector(v); reset1(); }} allTopLabel="All sectors" />
				<RefSlugFilter kind="sports" ariaLabel="Sport" value={sport} onChange={(v) => { setSport(v); reset1(); }} allLabel="All sports" />
				<RefSlugFilter kind="round-types" ariaLabel="Round" value={roundType} onChange={(v) => { setRoundType(v); reset1(); }} allLabel="All rounds" />
				<FilterRange label="Amount $" min={amountMin} max={amountMax} onMin={(v) => { setAmountMin(v); reset1(); }} onMax={(v) => { setAmountMax(v); reset1(); }} />
				<FilterSelect ariaLabel="Disclosed" value={disclosed} onChange={(v) => { setDisclosed(v); reset1(); }} options={[{ value: 'true', label: 'Disclosed only' }]} allLabel="Any amount" />
				<div style={{ flex: 1 }} />
				<CsvImportButton entity="deals" onDone={() => void refresh()} />
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add deal</button>
			</FilterBar>

			{(creating || editingId) && (
				<DealModal id={editingId} onClose={() => { setCreating(false); setEditingId(null); }} onSaved={() => { setCreating(false); setEditingId(null); void refresh(); }} />
			)}

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={deals.length === 0} emptyMsg={search ? 'No deals match.' : 'No deals yet.'} onRetry={() => void refresh()}>
					<table className="data-table">
						<thead><tr><th>Company</th><th>Round</th><SortableTh label="Year" field="announced_date" sort={sort} onSort={onSort} /><SortableTh label="Amount" field="amount_usd" sort={sort} onSort={onSort} /><th>Status</th><th style={{ textAlign: 'right' }} /></tr></thead>
						<tbody>
							{deals.map((d) => (
								<tr key={d.id}>
									<td>{d.company_name ?? '—'}</td>
									<td>{d.round_type_name ?? '—'}</td>
									<td className="num">{d.announced_year ?? '—'}</td>
									<td className="num">{fmtAmount(d.amount_usd)}</td>
									<td>{d.status ?? '—'}</td>
									<td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
										<button className="btn ghost" onClick={() => setEditingId(d.id)}>Edit</button>
										<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void remove(d.id)}><Trash2 size={12} /></button>
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

interface DealForm {
	company_id: string; round_type_id: string; announced_date: string; amount: string;
	currency_code: string; deal_size_bucket: string; status: string; sector_id: string;
	business_model: string; source_url: string; transaction_url: string; hq: LocationValue;
	sport_ids: string[]; investors: DealInvestor[];
}
const EMPTY_DEAL: DealForm = {
	company_id: '', round_type_id: '', announced_date: '', amount: '', currency_code: '',
	deal_size_bucket: '', status: 'active', sector_id: '', business_model: '', source_url: '', transaction_url: '',
	hq: { ...EMPTY_LOCATION }, sport_ids: [], investors: [],
};

interface DealEdit {
	company_id?: string; round_type_id?: string | null; announced_date?: string | null; amount?: string | null; amount_usd?: string | null;
	currency_code?: string | null; deal_size_bucket?: string | null; status?: string | null; sector_id?: string | null;
	business_model?: string | null; source_url?: string | null; transaction_url?: string | null;
	hq_country?: string | null; hq_city?: string | null; hq_continent?: string | null; hq_region?: string | null; hq_state?: string | null; sport_ids?: string[]; investors?: DealInvestor[];
}

function toDealForm(h: DealEdit): DealForm {
	return {
		company_id: h.company_id ?? '', round_type_id: h.round_type_id ?? '',
		announced_date: h.announced_date ? String(h.announced_date).slice(0, 10) : '',
		amount: h.amount ?? h.amount_usd ?? '', currency_code: h.currency_code ?? '',
		deal_size_bucket: h.deal_size_bucket ?? '', status: h.status ?? 'active',
		sector_id: h.sector_id ?? '', business_model: h.business_model ?? '',
		source_url: h.source_url ?? '', transaction_url: h.transaction_url ?? '',
		hq: { country: h.hq_country ?? '', city: h.hq_city ?? '', continent: h.hq_continent ?? '', region: h.hq_region ?? '', state: h.hq_state ?? '' },
		sport_ids: h.sport_ids ?? [], investors: h.investors ?? [],
	};
}

// A staged draft = the POST body for a deal, minus company_id, plus a tiny
// label snapshot so the parent can render the row before the deal exists.
export interface StagedDeal { body: Record<string, unknown>; label: { round?: string; amount?: string; year?: string } }

export function DealModal({ id, onClose, onSaved, lockedCompanyId, onStage }: { id: string | null; onClose: () => void; onSaved: () => void; lockedCompanyId?: string; onStage?: (d: StagedDeal) => void }) {
	const isEdit = !!id;
	const { data: hydrated } = useSWR<DealEdit>(isEdit ? [`/api/admin/deals/${id}/edit`] : null, { revalidateOnFocus: false });
	if (isEdit && !hydrated) return <Modal title="Edit deal" onClose={onClose}><Loading msg="Loading deal…" /></Modal>;
	const initial = hydrated ? toDealForm(hydrated) : { ...EMPTY_DEAL, company_id: lockedCompanyId ?? '' };
	return <DealForm id={id} initial={initial} onClose={onClose} onSaved={onSaved} onStage={onStage} />;
}

function DealForm({ id, initial, onClose, onSaved, onStage }: { id: string | null; initial: DealForm; onClose: () => void; onSaved: () => void; onStage?: (d: StagedDeal) => void }) {
	const isEdit = !!id;
	const stageMode = !!onStage;
	const [tab, setTab] = useTabs('deal');
	const [form, setForm] = useState<DealForm>(initial);
	const [pending, setPending] = useState(false);

	const set = <K extends keyof DealForm>(k: K, v: DealForm[K]) => setForm((f) => ({ ...f, [k]: v }));

	const submit = async () => {
		setPending(true);
		try {
			const body: Record<string, unknown> = {
				company_id: form.company_id,
				round_type_id: form.round_type_id || undefined,
				announced_date: form.announced_date || undefined,
				amount: form.amount.trim() ? Number(form.amount) : undefined,
				currency_code: form.currency_code || undefined,
				deal_size_bucket: form.deal_size_bucket || undefined,
				status: form.status,
				sector_id: form.sector_id || undefined,
				business_model: form.business_model || undefined,
				source_url: form.source_url.trim() || undefined,
				transaction_url: form.transaction_url.trim() || undefined,
				hq_country: form.hq.country.trim() || undefined,
				hq_city: form.hq.city.trim() || undefined,
				hq_continent: form.hq.continent.trim() || undefined,
				hq_region: form.hq.region.trim() || undefined,
				hq_state: form.hq.state.trim() || undefined,
				sport_ids: form.sport_ids,
				investors: form.investors,
			};
			if (onStage) {
				// New (unsaved) company: hand the draft back to the parent instead of
				// POSTing. company_id is omitted — the server fills it on save.
				const { company_id, ...rest } = body;
				void company_id;
				onStage({ body: rest, label: { amount: fmtAmount(form.amount || null), year: form.announced_date ? form.announced_date.slice(0, 4) : undefined } });
				onSaved();
				return;
			}
			if (isEdit) await api('PATCH', `/api/admin/deals/${id}`, body);
			else await api('POST', '/api/admin/deals', body);
			toast.success(isEdit ? 'Saved' : 'Created');
			onSaved();
		} catch (e) { toast.error((e as Error).message); } finally { setPending(false); }
	};

	return (
		<Modal
			title={isEdit ? 'Edit deal' : stageMode ? 'Add funding round' : 'New deal'}
			onClose={onClose}
			width={680}
			footer={
				<>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={(!stageMode && !form.company_id) || pending} onClick={() => void submit()}>
						<Save size={12} /> {pending ? 'Saving…' : stageMode ? 'Add round' : 'Save'}
					</button>
				</>
			}
		>
			{(
				<TabbedForm
					active={tab}
					onChange={setTab}
					tabs={[
						{ key: 'deal', label: 'Deal', node: (
							<>
								{stageMode ? (
									<div style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 4 }}>This round will be linked to the new company when you save it.</div>
								) : (
									<Field label="Company"><CompanySelectOne value={form.company_id} onChange={(v) => set('company_id', v)} /></Field>
								)}
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
									<Field label="Round type"><RoundTypeSelect value={form.round_type_id} onChange={(v) => set('round_type_id', v)} /></Field>
									<Field label="Announced date"><input className="search-input" type="date" value={form.announced_date} onChange={(e) => set('announced_date', e.target.value)} /></Field>
								</div>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr', gap: 12 }}>
									<Field label="Amount"><input className="search-input" type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="in currency below" /></Field>
									<Field label="Currency"><CurrencySelect value={form.currency_code} onChange={(v) => set('currency_code', v)} /></Field>
									<Field label="Size bucket">
										<select className="search-input" value={form.deal_size_bucket} onChange={(e) => set('deal_size_bucket', e.target.value)}>
											<option value="">—</option>
											{SIZE_BUCKETS.map((b) => <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>)}
										</select>
									</Field>
								</div>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
									<Field label="Source URL"><input className="search-input" value={form.source_url} onChange={(e) => set('source_url', e.target.value)} placeholder="https://" /></Field>
									<Field label="Transaction URL"><input className="search-input" value={form.transaction_url} onChange={(e) => set('transaction_url', e.target.value)} placeholder="https://" /></Field>
								</div>
								<Field label="Status">
									<select className="search-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
										{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
									</select>
								</Field>
							</>
						) },
						{ key: 'investors', label: 'Investors', hint: form.investors.length, node: (
							<Field label="Investors" hint="star marks the lead"><InvestorPicker value={form.investors} onChange={(v) => set('investors', v)} /></Field>
						) },
						{ key: 'class', label: 'Classification', hint: form.sport_ids.length, node: (
							<>
								<Field label="Sector"><SectorCascade value={form.sector_id} onChange={(v) => set('sector_id', v)} /></Field>
								<Field label="Business model">
									<select className="search-input" value={form.business_model} onChange={(e) => set('business_model', e.target.value)}>
										<option value="">—</option>
										{BUSINESS_MODELS.map((b) => <option key={b} value={b}>{b.toUpperCase()}</option>)}
									</select>
								</Field>
								<Field label="Location"><LocationFields value={form.hq} onChange={(v) => set('hq', v)} /></Field>
								<Field label="Sports"><SportsPicker value={form.sport_ids} onChange={(v) => set('sport_ids', v)} /></Field>
							</>
						) },
					]}
				/>
			)}
		</Modal>
	);
}

export default function DealsAdminPage() { return <DealsView />; }
