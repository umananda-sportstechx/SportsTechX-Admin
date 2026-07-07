'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useConfirm } from '@/components/confirm';
import { Modal } from '@/components/modal';
import { Field } from '@/components/tabbed-form';
import { PageHeader, AsyncState, StatCard, Pager } from '@/components/atoms';
import { FilterBar, FilterSelect, StatStrip } from '@/components/filters';

// Sales ▸ Records — manual sales-entry ledger (ported from the STX-WebApp Sales tab).
interface SalesRecord {
	id: string;
	invoice_date: string | null;
	year: number | null;
	quarter: string | null;
	invoice_source: string | null;
	product_category: string | null;
	product_service_name: string | null;
	client_name: string | null;
	website: string | null;
	client_type: string | null;
	lead_source: string | null;
	revenue_amount: number | null;
	discount_applied: boolean;
}
interface RecordsResponse { data: SalesRecord[]; total: number; totalPages: number }
interface Summary { count: number; revenue: number; clients: number }

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
const fmtMoney = (n: number): string => `$${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

type FormState = Omit<SalesRecord, 'id'>;
const EMPTY_FORM: FormState = {
	invoice_date: '', year: null, quarter: '', invoice_source: '', product_category: '',
	product_service_name: '', client_name: '', website: '', client_type: '', lead_source: '',
	revenue_amount: null, discount_applied: false,
};

export default function SalesRecordsPage() {
	const { mutate } = useSWRConfig();
	const ask = useConfirm();
	const [search, setSearch] = useState('');
	const debouncedSearch = useDebouncedValue(search);
	const [year, setYear] = useState('');
	const [page, setPage] = useState(1);
	const [editing, setEditing] = useState<SalesRecord | null>(null);
	const [creating, setCreating] = useState(false);

	const { data, error, isLoading } = useSWR<RecordsResponse>(
		['/api/admin/sales-records', { q: debouncedSearch || undefined, year: year || undefined, page, limit: 30 }],
		{ dedupingInterval: 15_000 },
	);
	const summary = useSWR<Summary>(['/api/admin/sales-records/summary'], { dedupingInterval: 30_000 });
	const refresh = () => {
		void mutate((key) => Array.isArray(key) && String(key[0]).startsWith('/api/admin/sales-records'));
	};

	const remove = async (id: string) => {
		if (!(await ask({ message: 'Delete this sales record?', danger: true, confirmLabel: 'Delete' }))) return;
		try {
			await api('DELETE', `/api/admin/sales-records/${id}`);
			toast.success('Deleted');
			refresh();
		} catch (e) { toast.error((e as Error).message); }
	};

	const rows = data?.data ?? [];
	const yearOpts = Array.from({ length: 8 }, (_, i) => String(new Date().getFullYear() - i));

	return (
		<div>
			<PageHeader kicker="Sales" title="Records" subtitle="Manual sales entries — revenue, client and product detail." />

			<StatStrip cols={3}>
				<StatCard label="Total records" loading={summary.isLoading} value={(summary.data?.count ?? 0).toLocaleString()} />
				<StatCard label="Total revenue" loading={summary.isLoading} value={fmtMoney(summary.data?.revenue ?? 0)} />
				<StatCard label="Clients" loading={summary.isLoading} value={(summary.data?.clients ?? 0).toLocaleString()} />
			</StatStrip>

			<FilterBar>
				<input className="search-input" style={{ flex: '0 0 260px', height: 32 }} placeholder="Search client / product / source…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
				<FilterSelect ariaLabel="Year" value={year} onChange={(v) => { setYear(v); setPage(1); }} options={yearOpts} allLabel="All years" />
				<div style={{ flex: 1 }} />
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add record</button>
			</FilterBar>

			{(creating || editing) && (
				<RecordModal
					record={editing}
					onClose={() => { setCreating(false); setEditing(null); }}
					onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
				/>
			)}

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={rows.length === 0} emptyMsg={search || year ? 'No records match.' : 'No sales records yet.'} onRetry={refresh}>
					<div className="table-scroll">
						<table className="data-table">
							<thead>
								<tr>
									<th>Invoice</th><th>Year</th><th>Quarter</th><th>Client</th>
									<th>Product / service</th><th>Category</th>
									<th style={{ textAlign: 'right' }}>Revenue</th><th>Discount</th><th style={{ textAlign: 'right' }} />
								</tr>
							</thead>
							<tbody>
								{rows.map((r) => (
									<tr key={r.id}>
										<td>{r.invoice_date ?? '—'}</td>
										<td className="num">{r.year ?? '—'}</td>
										<td>{r.quarter ?? '—'}</td>
										<td>{r.client_name ?? '—'}</td>
										<td>{r.product_service_name ?? '—'}</td>
										<td>{r.product_category ?? '—'}</td>
										<td className="num" style={{ textAlign: 'right' }}>{r.revenue_amount != null ? fmtMoney(r.revenue_amount) : '—'}</td>
										<td>{r.discount_applied ? 'Yes' : 'No'}</td>
										<td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
											<button className="btn ghost" onClick={() => setEditing(r)}>Edit</button>
											<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void remove(r.id)}><Trash2 size={12} /></button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</AsyncState>
			</div>
			<Pager page={page} totalPages={data?.totalPages} onPage={setPage} />
		</div>
	);
}

function RecordModal({ record, onClose, onSaved }: { record: SalesRecord | null; onClose: () => void; onSaved: () => void }) {
	const [f, setF] = useState<FormState>(record ? { ...record } : { ...EMPTY_FORM });
	const [saving, setSaving] = useState(false);
	const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

	const save = async () => {
		setSaving(true);
		try {
			const body = {
				...f,
				year: f.year === null || String(f.year) === '' ? null : Number(f.year),
				revenue_amount: f.revenue_amount === null || String(f.revenue_amount) === '' ? null : Number(f.revenue_amount),
			};
			if (record) await api('PATCH', `/api/admin/sales-records/${record.id}`, body);
			else await api('POST', '/api/admin/sales-records', body);
			toast.success(record ? 'Updated' : 'Record added');
			onSaved();
		} catch (e) { toast.error((e as Error).message); }
		finally { setSaving(false); }
	};

	const input = (k: keyof FormState, placeholder = '') => (
		<input className="search-input" style={{ height: 34, width: '100%' }} placeholder={placeholder}
			value={(f[k] as string | number | null) ?? ''} onChange={(e) => set(k, e.target.value as FormState[typeof k])} />
	);

	return (
		<Modal
			title={record ? 'Edit sales record' : 'Add sales record'}
			width={640}
			onClose={onClose}
			footer={
				<>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
				</>
			}
		>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
				<Field label="Invoice date" hint="MM-YY">{input('invoice_date', '03-26')}</Field>
				<Field label="Invoice / source">{input('invoice_source')}</Field>
				<Field label="Year">
					<input className="search-input" type="number" style={{ height: 34, width: '100%' }} value={f.year ?? ''} onChange={(e) => set('year', e.target.value === '' ? null : Number(e.target.value))} />
				</Field>
				<Field label="Quarter">
					<FilterSelect ariaLabel="Quarter" value={f.quarter ?? ''} onChange={(v) => set('quarter', v)} options={[...QUARTERS]} allLabel="—" />
				</Field>
				<Field label="Client name">{input('client_name')}</Field>
				<Field label="Client type">{input('client_type')}</Field>
				<Field label="Product / service name">{input('product_service_name')}</Field>
				<Field label="Product category">{input('product_category')}</Field>
				<Field label="Website">{input('website')}</Field>
				<Field label="Lead source">{input('lead_source')}</Field>
				<Field label="Revenue amount" hint="incl. VAT">
					<input className="search-input" type="number" style={{ height: 34, width: '100%' }} value={f.revenue_amount ?? ''} onChange={(e) => set('revenue_amount', e.target.value === '' ? null : Number(e.target.value))} />
				</Field>
				<Field label="Discount applied">
					<label style={{ display: 'flex', gap: 8, alignItems: 'center', height: 34 }}>
						<input type="checkbox" checked={f.discount_applied} onChange={(e) => set('discount_applied', e.target.checked)} /> Yes
					</label>
				</Field>
			</div>
		</Modal>
	);
}
