'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/confirm';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState, Loading, StatCard, Section, Pager } from '@/components/atoms';
import { ComboBarLine, PieDonut, PieLegend, toSegments, type Bucket } from '@/components/charts';
import { FilterBar, FilterSelect, StatStrip } from '@/components/filters';
import { CsvImportButton } from '@/components/csv-import';
import { TabbedForm, Field, useTabs } from '@/components/tabbed-form';
import { CompanySelectOne, SectorCascade, SportsPicker, CurrencySelect, LocationFields, EMPTY_LOCATION, type LocationValue } from '@/components/entity-pickers';

interface Acquisition {
	id: string;
	acquiree_name?: string | null;
	acquirer_name?: string | null;
	acquisition_year?: number | null;
	amount_usd?: string | null;
	acquisition_type?: string | null;
	primary_sector?: string | null;
}
interface AcqResponse { data: Acquisition[]; total: number; totalPages: number }
interface AcqStats { total: number; total_amount: number; sportstech: number; by_year: Array<{ year: number; deals: number; amt: number }>; by_type: Bucket[] }

const TYPES = ['acquisition', 'merger', 'asset_purchase'] as const;
const BUSINESS_MODELS = ['b2b', 'b2c', 'b2b2c', 'd2c', 'b2g', 'other'] as const;

function fmtAmount(v?: string | null): string {
	if (!v) return '—';
	const n = Number(v);
	if (!Number.isFinite(n) || n <= 0) return 'Undisclosed';
	if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
	if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
	return `$${n.toLocaleString()}`;
}
const fmtMoney = (n: number): string => n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : `$${(n / 1e6).toFixed(1)}M`;

export default function AcquisitionsAdminPage() {
	const { mutate } = useSWRConfig();
	const ask = useConfirm();
	const [search, setSearch] = useState('');
	const [type, setType] = useState('');
	const [year, setYear] = useState('');
	const [page, setPage] = useState(1);
	const [creating, setCreating] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);

	const { data, error, isLoading } = useSWR<AcqResponse>(
		['/api/acquisitions', {
			q: search || undefined, acquisition_type: type || undefined, year: year || undefined,
			page, limit: 30, sort: '-acquisition_date',
		}],
		{ dedupingInterval: 30_000 },
	);
	const stats = useSWR<AcqStats>(['/api/admin/stats/acquisitions'], { dedupingInterval: 60_000 });
	const yearChart = (stats.data?.by_year ?? []).map((r) => ({ year: r.year, amt: Number(r.amt), deals: Number(r.deals) }));
	const typeSegments = toSegments(stats.data?.by_type ?? []);
	const yearOpts = (stats.data?.by_year ?? []).map((r) => String(r.year)).reverse();
	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/acquisitions');

	const remove = async (id: string) => {
		if (!(await ask('Delete this acquisition?'))) return;
		try {
			await api('DELETE', `/api/admin/acquisitions/${id}`);
			toast.success('Deleted');
			void refresh();
		} catch (e) { toast.error((e as Error).message); }
	};

	const rows = data?.data ?? [];
	return (
		<div>
			<PageHeader kicker={`M&A · ${(stats.data?.total ?? data?.total ?? 0).toLocaleString()} deals`} title="Acquisitions" />

			<StatStrip cols={3}>
				<StatCard label="Total acquisitions" loading={stats.isLoading} value={(stats.data?.total ?? 0).toLocaleString()} />
				<StatCard label="Total value (disclosed)" loading={stats.isLoading} value={fmtMoney(stats.data?.total_amount ?? 0)} />
				<StatCard label="SportsTech acquirees" loading={stats.isLoading} value={(stats.data?.sportstech ?? 0).toLocaleString()} />
			</StatStrip>

			<div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<Section title="Acquisitions by year" meta="value · count">
					<AsyncState loading={stats.isLoading} error={stats.error} empty={yearChart.length === 0} emptyMsg="No data" onRetry={() => void stats.mutate()}>
						<ComboBarLine data={yearChart} height={240} valueFormatter={fmtMoney} barLabel="Value" lineLabel="deals" />
					</AsyncState>
				</Section>
				<Section title="By type" meta="deals">
					<AsyncState loading={stats.isLoading} error={stats.error} empty={typeSegments.length === 0} emptyMsg="No data" onRetry={() => void stats.mutate()}>
						<div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
							<PieDonut segments={typeSegments} size={170} mode="donut" />
							<PieLegend segments={typeSegments} />
						</div>
					</AsyncState>
				</Section>
			</div>

			<FilterBar>
				<input className="search-input" style={{ flex: '0 0 280px', height: 32 }} placeholder="Search acquiree / acquirer…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
				<FilterSelect ariaLabel="Type" value={type} onChange={(v) => { setType(v); setPage(1); }} options={[...TYPES]} allLabel="All types" />
				<FilterSelect ariaLabel="Year" value={year} onChange={(v) => { setYear(v); setPage(1); }} options={yearOpts} allLabel="All years" />
				<div style={{ flex: 1 }} />
				<CsvImportButton entity="acquisitions" onDone={() => void refresh()} />
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add acquisition</button>
			</FilterBar>

			{(creating || editingId) && (
				<AcquisitionModal id={editingId} onClose={() => { setCreating(false); setEditingId(null); }} onSaved={() => { setCreating(false); setEditingId(null); void refresh(); }} />
			)}

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={rows.length === 0} emptyMsg={search ? 'No acquisitions match.' : 'No acquisitions yet.'} onRetry={() => void refresh()}>
					<table className="data-table">
						<thead><tr><th>Acquiree</th><th>Acquirer</th><th>Year</th><th>Amount</th><th>Type</th><th style={{ textAlign: 'right' }} /></tr></thead>
						<tbody>
							{rows.map((a) => (
								<tr key={a.id}>
									<td>{a.acquiree_name ?? '—'}</td>
									<td>{a.acquirer_name ?? '—'}</td>
									<td className="num">{a.acquisition_year ?? '—'}</td>
									<td className="num">{fmtAmount(a.amount_usd)}</td>
									<td>{a.acquisition_type ?? '—'}</td>
									<td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
										<button className="btn ghost" onClick={() => setEditingId(a.id)}>Edit</button>
										<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void remove(a.id)}><Trash2 size={12} /></button>
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

interface PartyForm {
	is_sportstech: boolean; sector_id: string; business_model: string; hq: LocationValue; sport_ids: string[];
}
interface AcqForm {
	acquiree_company_id: string;
	acquirer_company_id: string;
	acquirer_name: string;
	acquisition_date: string; amount: string; currency_code: string; acquisition_type: string; source_url: string;
	acquiree: PartyForm; acquirer: PartyForm;
}
const emptyParty = (): PartyForm => ({ is_sportstech: false, sector_id: '', business_model: '', hq: { ...EMPTY_LOCATION }, sport_ids: [] });
const EMPTY_ACQ: AcqForm = {
	acquiree_company_id: '', acquirer_company_id: '', acquirer_name: '',
	acquisition_date: '', amount: '', currency_code: '', acquisition_type: 'acquisition', source_url: '',
	acquiree: emptyParty(), acquirer: emptyParty(),
};

interface AcqEdit {
	acquiree_company_id?: string | null; acquirer_company_id?: string | null; acquirer_name?: string | null;
	acquisition_date?: string | null; amount?: string | null; amount_usd?: string | null; currency_code?: string | null;
	acquisition_type?: string | null; source_url?: string | null;
	acquiree_is_sportstech?: boolean | null; acquirer_is_sportstech?: boolean | null;
	acquiree_sector_id?: string | null; acquirer_sector_id?: string | null;
	acquiree_business_model?: string | null; acquirer_business_model?: string | null;
	acquiree_hq_country?: string | null; acquiree_hq_city?: string | null; acquiree_hq_continent?: string | null; acquiree_hq_region?: string | null; acquiree_hq_state?: string | null;
	acquirer_hq_country?: string | null; acquirer_hq_city?: string | null; acquirer_hq_continent?: string | null; acquirer_hq_region?: string | null; acquirer_hq_state?: string | null;
	acquiree_sport_ids?: string[]; acquirer_sport_ids?: string[];
}

function toAcqForm(h: AcqEdit): AcqForm {
	return {
		acquiree_company_id: h.acquiree_company_id ?? '', acquirer_company_id: h.acquirer_company_id ?? '', acquirer_name: h.acquirer_name ?? '',
		acquisition_date: h.acquisition_date ? String(h.acquisition_date).slice(0, 10) : '',
		amount: h.amount ?? h.amount_usd ?? '', currency_code: h.currency_code ?? '',
		acquisition_type: h.acquisition_type ?? 'acquisition', source_url: h.source_url ?? '',
		acquiree: {
			is_sportstech: !!h.acquiree_is_sportstech, sector_id: h.acquiree_sector_id ?? '', business_model: h.acquiree_business_model ?? '',
			hq: { country: h.acquiree_hq_country ?? '', city: h.acquiree_hq_city ?? '', continent: h.acquiree_hq_continent ?? '', region: h.acquiree_hq_region ?? '', state: h.acquiree_hq_state ?? '' }, sport_ids: h.acquiree_sport_ids ?? [],
		},
		acquirer: {
			is_sportstech: !!h.acquirer_is_sportstech, sector_id: h.acquirer_sector_id ?? '', business_model: h.acquirer_business_model ?? '',
			hq: { country: h.acquirer_hq_country ?? '', city: h.acquirer_hq_city ?? '', continent: h.acquirer_hq_continent ?? '', region: h.acquirer_hq_region ?? '', state: h.acquirer_hq_state ?? '' }, sport_ids: h.acquirer_sport_ids ?? [],
		},
	};
}

// A staged M&A draft = the POST body minus acquiree_company_id (the new company),
// plus a small label snapshot for rendering the row before the company exists.
export interface StagedAcq { body: Record<string, unknown>; label: { acquirer?: string; amount?: string; year?: string } }

export function AcquisitionModal({ id, onClose, onSaved, onStage }: { id: string | null; onClose: () => void; onSaved: () => void; onStage?: (a: StagedAcq) => void }) {
	const isEdit = !!id;
	const { data: hydrated } = useSWR<AcqEdit>(isEdit ? [`/api/admin/acquisitions/${id}/edit`] : null, { revalidateOnFocus: false });
	if (isEdit && !hydrated) return <Modal title="Edit acquisition" onClose={onClose}><Loading msg="Loading acquisition…" /></Modal>;
	return <AcquisitionForm id={id} initial={hydrated ? toAcqForm(hydrated) : EMPTY_ACQ} onClose={onClose} onSaved={onSaved} onStage={onStage} />;
}

function AcquisitionForm({ id, initial, onClose, onSaved, onStage }: { id: string | null; initial: AcqForm; onClose: () => void; onSaved: () => void; onStage?: (a: StagedAcq) => void }) {
	const isEdit = !!id;
	const stageMode = !!onStage;
	const [tab, setTab] = useTabs('acquiree');
	const [form, setForm] = useState<AcqForm>(initial);
	const [pending, setPending] = useState(false);

	const set = <K extends keyof AcqForm>(k: K, v: AcqForm[K]) => setForm((f) => ({ ...f, [k]: v }));
	const setParty = (party: 'acquiree' | 'acquirer', patch: Partial<PartyForm>) =>
		setForm((f) => ({ ...f, [party]: { ...f[party], ...patch } }));

	const submit = async () => {
		setPending(true);
		try {
			const body: Record<string, unknown> = {
				acquiree_company_id: form.acquiree_company_id,
				acquirer_company_id: form.acquirer_company_id || undefined,
				acquirer_name: !form.acquirer_company_id && form.acquirer_name.trim() ? form.acquirer_name.trim() : undefined,
				acquisition_date: form.acquisition_date || undefined,
				amount: form.amount.trim() ? Number(form.amount) : undefined,
				currency_code: form.currency_code || undefined,
				acquisition_type: form.acquisition_type,
				source_url: form.source_url.trim() || undefined,
				acquiree_is_sportstech: form.acquiree.is_sportstech,
				acquirer_is_sportstech: form.acquirer.is_sportstech,
				acquiree_sector_id: form.acquiree.sector_id || undefined,
				acquirer_sector_id: form.acquirer.sector_id || undefined,
				acquiree_business_model: form.acquiree.business_model || undefined,
				acquirer_business_model: form.acquirer.business_model || undefined,
				acquiree_hq_country: form.acquiree.hq.country.trim() || undefined,
				acquiree_hq_city: form.acquiree.hq.city.trim() || undefined,
				acquiree_hq_continent: form.acquiree.hq.continent.trim() || undefined,
				acquiree_hq_region: form.acquiree.hq.region.trim() || undefined,
				acquiree_hq_state: form.acquiree.hq.state.trim() || undefined,
				acquirer_hq_country: form.acquirer.hq.country.trim() || undefined,
				acquirer_hq_city: form.acquirer.hq.city.trim() || undefined,
				acquirer_hq_continent: form.acquirer.hq.continent.trim() || undefined,
				acquirer_hq_region: form.acquirer.hq.region.trim() || undefined,
				acquirer_hq_state: form.acquirer.hq.state.trim() || undefined,
				acquiree_sport_ids: form.acquiree.sport_ids,
				acquirer_sport_ids: form.acquirer.sport_ids,
			};
			if (onStage) {
				// New (unsaved) company is the acquiree — hand the draft to the parent;
				// the server fills acquiree_company_id on save.
				const { acquiree_company_id, ...rest } = body;
				void acquiree_company_id;
				onStage({ body: rest, label: { acquirer: form.acquirer_name.trim() || undefined, amount: fmtAmount(form.amount || null), year: form.acquisition_date ? form.acquisition_date.slice(0, 4) : undefined } });
				onSaved();
				return;
			}
			if (isEdit) await api('PATCH', `/api/admin/acquisitions/${id}`, body);
			else await api('POST', '/api/admin/acquisitions', body);
			toast.success(isEdit ? 'Saved' : 'Created');
			onSaved();
		} catch (e) { toast.error((e as Error).message); } finally { setPending(false); }
	};

	const partyTab = (party: 'acquiree' | 'acquirer') => {
		const p = form[party];
		return (
			<>
				{party === 'acquiree' ? (
					stageMode ? (
						<div style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 4 }}>The new company is the acquiree — it will be linked when you save it.</div>
					) : (
						<Field label="Acquiree company"><CompanySelectOne value={form.acquiree_company_id} onChange={(v) => set('acquiree_company_id', v)} /></Field>
					)
				) : (
					<>
						<Field label="Acquirer company (if in DB)"><CompanySelectOne value={form.acquirer_company_id} onChange={(v) => set('acquirer_company_id', v)} /></Field>
						{!form.acquirer_company_id && (
							<Field label="…or acquirer name (free text)"><input className="search-input" value={form.acquirer_name} onChange={(e) => set('acquirer_name', e.target.value)} /></Field>
						)}
					</>
				)}
				<Field label="Sector"><SectorCascade value={p.sector_id} onChange={(v) => setParty(party, { sector_id: v })} /></Field>
				<Field label="Business model">
					<select className="search-input" value={p.business_model} onChange={(e) => setParty(party, { business_model: e.target.value })}>
						<option value="">—</option>
						{BUSINESS_MODELS.map((b) => <option key={b} value={b}>{b.toUpperCase()}</option>)}
					</select>
				</Field>
				<Field label="Location"><LocationFields value={p.hq} onChange={(v) => setParty(party, { hq: v })} /></Field>
				<Field label="Sports"><SportsPicker value={p.sport_ids} onChange={(v) => setParty(party, { sport_ids: v })} /></Field>
				<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
					<input type="checkbox" checked={p.is_sportstech} onChange={(e) => setParty(party, { is_sportstech: e.target.checked })} /> Is SportsTech
				</label>
			</>
		);
	};

	return (
		<Modal
			title={isEdit ? 'Edit acquisition' : stageMode ? 'Add acquisition' : 'New acquisition'}
			onClose={onClose}
			width={680}
			footer={
				<>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={(!stageMode && !form.acquiree_company_id) || pending} onClick={() => void submit()}>
						<Save size={12} /> {pending ? 'Saving…' : stageMode ? 'Add acquisition' : 'Save'}
					</button>
				</>
			}
		>
			{(
				<TabbedForm
					active={tab}
					onChange={setTab}
					tabs={[
						{ key: 'acquiree', label: 'Acquiree', hint: form.acquiree.sport_ids.length, node: partyTab('acquiree') },
						{ key: 'acquirer', label: 'Acquirer', hint: form.acquirer.sport_ids.length, node: partyTab('acquirer') },
						{ key: 'deal', label: 'Deal', node: (
							<>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
									<Field label="Acquisition date"><input className="search-input" type="date" value={form.acquisition_date} onChange={(e) => set('acquisition_date', e.target.value)} /></Field>
									<Field label="Type">
										<select className="search-input" value={form.acquisition_type} onChange={(e) => set('acquisition_type', e.target.value)}>
											{TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
										</select>
									</Field>
								</div>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
									<Field label="Amount"><input className="search-input" type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="in currency" /></Field>
									<Field label="Currency"><CurrencySelect value={form.currency_code} onChange={(v) => set('currency_code', v)} /></Field>
								</div>
								<Field label="Source URL"><input className="search-input" value={form.source_url} onChange={(e) => set('source_url', e.target.value)} placeholder="https://" /></Field>
							</>
						) },
					]}
				/>
			)}
		</Modal>
	);
}
