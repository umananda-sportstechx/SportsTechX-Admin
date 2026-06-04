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
	CompanySelectOne, SectorCascade, SportsPicker, RoundTypeSelect, CurrencySelect, InvestorPicker, LocationFields,
	type DealInvestor, type LocationValue,
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

const STATUSES = ['active', 'inactive', 'not_sportstech', 'website_error'] as const;
const BUSINESS_MODELS = ['b2b', 'b2c', 'b2b2c', 'd2c', 'b2g', 'other'] as const;
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

export default function DealsAdminPage() {
	const { mutate } = useSWRConfig();
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [creating, setCreating] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);

	const { data, error, isLoading } = useSWR<DealsResponse>(
		['/api/deals', { q: search || undefined, page, limit: 30, sort: '-announced_date' }],
		{ dedupingInterval: 30_000 },
	);
	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/deals');

	const remove = async (id: string) => {
		if (!confirm('Delete this deal?')) return;
		try {
			await api('DELETE', `/api/admin/deals/${id}`);
			toast.success('Deleted');
			void refresh();
		} catch (e) { toast.error((e as Error).message); }
	};

	const deals = data?.data ?? [];
	return (
		<div>
			<PageHeader kicker={`Funding · ${(data?.total ?? 0).toLocaleString()} deals`} title="Deals" />

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				<input className="search-input" style={{ flex: '0 0 320px', height: 32 }} placeholder="Search by company…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
				<div style={{ flex: 1 }} />
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add deal</button>
			</div>

			{(creating || editingId) && (
				<DealModal id={editingId} onClose={() => { setCreating(false); setEditingId(null); }} onSaved={() => { setCreating(false); setEditingId(null); void refresh(); }} />
			)}

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={deals.length === 0} emptyMsg={search ? 'No deals match.' : 'No deals yet.'} onRetry={() => void refresh()}>
					<table className="data-table">
						<thead><tr><th>Company</th><th>Round</th><th>Year</th><th>Amount</th><th>Status</th><th style={{ textAlign: 'right' }} /></tr></thead>
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
		</div>
	);
}

interface DealForm {
	company_id: string; round_type_id: string; announced_date: string; amount_usd: string;
	currency_code: string; deal_size_bucket: string; status: string; sector_id: string;
	business_model: string; source_url: string; transaction_url: string; hq: LocationValue;
	sport_ids: string[]; investors: DealInvestor[];
}
const EMPTY_DEAL: DealForm = {
	company_id: '', round_type_id: '', announced_date: '', amount_usd: '', currency_code: '',
	deal_size_bucket: '', status: 'active', sector_id: '', business_model: '', source_url: '', transaction_url: '',
	hq: { country: '', city: '' }, sport_ids: [], investors: [],
};

interface DealEdit {
	company_id?: string; round_type_id?: string | null; announced_date?: string | null; amount_usd?: string | null;
	currency_code?: string | null; deal_size_bucket?: string | null; status?: string | null; sector_id?: string | null;
	business_model?: string | null; source_url?: string | null; transaction_url?: string | null;
	hq_country?: string | null; hq_city?: string | null; sport_ids?: string[]; investors?: DealInvestor[];
}

function toDealForm(h: DealEdit): DealForm {
	return {
		company_id: h.company_id ?? '', round_type_id: h.round_type_id ?? '',
		announced_date: h.announced_date ? String(h.announced_date).slice(0, 10) : '',
		amount_usd: h.amount_usd ?? '', currency_code: h.currency_code ?? '',
		deal_size_bucket: h.deal_size_bucket ?? '', status: h.status ?? 'active',
		sector_id: h.sector_id ?? '', business_model: h.business_model ?? '',
		source_url: h.source_url ?? '', transaction_url: h.transaction_url ?? '',
		hq: { country: h.hq_country ?? '', city: h.hq_city ?? '' },
		sport_ids: h.sport_ids ?? [], investors: h.investors ?? [],
	};
}

function DealModal({ id, onClose, onSaved }: { id: string | null; onClose: () => void; onSaved: () => void }) {
	const isEdit = !!id;
	const { data: hydrated } = useSWR<DealEdit>(isEdit ? [`/api/admin/deals/${id}/edit`] : null, { revalidateOnFocus: false });
	if (isEdit && !hydrated) return <Modal title="Edit deal" onClose={onClose}><Loading msg="Loading deal…" /></Modal>;
	return <DealForm id={id} initial={hydrated ? toDealForm(hydrated) : EMPTY_DEAL} onClose={onClose} onSaved={onSaved} />;
}

function DealForm({ id, initial, onClose, onSaved }: { id: string | null; initial: DealForm; onClose: () => void; onSaved: () => void }) {
	const isEdit = !!id;
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
				amount_usd: form.amount_usd.trim() ? Number(form.amount_usd) : undefined,
				currency_code: form.currency_code || undefined,
				deal_size_bucket: form.deal_size_bucket || undefined,
				status: form.status,
				sector_id: form.sector_id || undefined,
				business_model: form.business_model || undefined,
				source_url: form.source_url.trim() || undefined,
				transaction_url: form.transaction_url.trim() || undefined,
				hq_country: form.hq.country.trim() || undefined,
				hq_city: form.hq.city.trim() || undefined,
				sport_ids: form.sport_ids,
				investors: form.investors,
			};
			if (isEdit) await api('PATCH', `/api/admin/deals/${id}`, body);
			else await api('POST', '/api/admin/deals', body);
			toast.success(isEdit ? 'Saved' : 'Created');
			onSaved();
		} catch (e) { toast.error((e as Error).message); } finally { setPending(false); }
	};

	return (
		<Modal
			title={isEdit ? 'Edit deal' : 'New deal'}
			onClose={onClose}
			width={680}
			footer={
				<>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={!form.company_id || pending} onClick={() => void submit()}>
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
						{ key: 'deal', label: 'Deal', node: (
							<>
								<Field label="Company"><CompanySelectOne value={form.company_id} onChange={(v) => set('company_id', v)} /></Field>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
									<Field label="Round type"><RoundTypeSelect value={form.round_type_id} onChange={(v) => set('round_type_id', v)} /></Field>
									<Field label="Announced date"><input className="search-input" type="date" value={form.announced_date} onChange={(e) => set('announced_date', e.target.value)} /></Field>
								</div>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 1fr', gap: 12 }}>
									<Field label="Amount (USD)"><input className="search-input" type="number" value={form.amount_usd} onChange={(e) => set('amount_usd', e.target.value)} /></Field>
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
