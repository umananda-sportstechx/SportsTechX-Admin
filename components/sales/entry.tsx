'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useConfirm } from '@/components/confirm';
import { Modal } from '@/components/modal';
import { Field } from '@/components/tabbed-form';
import { AsyncState, StatCard, Pager, SortableTh } from '@/components/atoms';
import { FilterBar, FilterSelect, StatStrip } from '@/components/filters';

/**
 * Sales Entry — manual sales ledger CRUD over sales_records (the legacy "Sales"
 * Records sub-tab). Full-fidelity port: global search, per-column tri-state sort
 * + per-column filter inputs, autocomplete-from-existing comboboxes, and a date
 * picker that auto-fills Year + Quarter.
 */
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
interface Options {
	product_category: string[]; product_service_name: string[]; client_name: string[];
	client_type: string[]; lead_source: string[]; invoice_source: string[];
}

const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4'] as const;
const money = (n: number, digits = 0) => {
	try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n); }
	catch { return `€${(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: digits })}`; }
};
// invoice_date is stored full-ISO ("YYYY-MM-DD") by the date picker; show MM-YY.
const fmtInvoice = (s: string | null): string => {
	if (!s) return '—';
	const m = /^(\d{4})-(\d{2})-\d{2}/.exec(s);
	return m ? `${m[2]}-${m[1].slice(2)}` : s;
};

type FormState = Omit<SalesRecord, 'id'>;
const EMPTY_FORM: FormState = {
	invoice_date: '', year: null, quarter: '', invoice_source: '', product_category: '',
	product_service_name: '', client_name: '', website: '', client_type: '', lead_source: '',
	revenue_amount: null, discount_applied: false,
};

export function SalesEntry() {
	const { mutate } = useSWRConfig();
	const ask = useConfirm();
	const [search, setSearch] = useState('');
	const debouncedSearch = useDebouncedValue(search);
	const [year, setYear] = useState('');
	const [sort, setSort] = useState('');
	const [filters, setFilters] = useState<Record<string, string>>({});
	const debouncedFilters = useDebouncedValue(filters);
	const [page, setPage] = useState(1);
	const [editing, setEditing] = useState<SalesRecord | null>(null);
	const [creating, setCreating] = useState(false);

	const activeFilters = Object.fromEntries(Object.entries(debouncedFilters).filter(([, v]) => v.trim()));
	const hasFilters = Object.keys(activeFilters).length > 0;

	const { data, error, isLoading } = useSWR<RecordsResponse>(
		['/api/admin/sales-records', {
			q: debouncedSearch || undefined, year: year || undefined, sort: sort || undefined,
			filters: hasFilters ? JSON.stringify(activeFilters) : undefined, page, limit: 30,
		}],
		{ dedupingInterval: 15_000 },
	);
	const summary = useSWR<Summary>(['/api/admin/sales-records/summary'], { dedupingInterval: 30_000 });
	const options = useSWR<Options>(['/api/admin/sales-records/options'], { dedupingInterval: 5 * 60_000 });

	const refresh = () => {
		void mutate((key) => Array.isArray(key) && String(key[0]).startsWith('/api/admin/sales-records'));
	};
	const setFilter = (col: string, v: string) => { setFilters((f) => ({ ...f, [col]: v })); setPage(1); };
	const clearAll = () => { setSearch(''); setYear(''); setSort(''); setFilters({}); setPage(1); };

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
	const anyFilter = !!(search || year || sort || hasFilters);

	return (
		<div>
			<StatStrip cols={3}>
				<StatCard label="Total records" loading={summary.isLoading} value={(summary.data?.count ?? 0).toLocaleString()} />
				<StatCard label="Total revenue" loading={summary.isLoading} value={money(summary.data?.revenue ?? 0)} />
				<StatCard label="Clients" loading={summary.isLoading} value={(summary.data?.clients ?? 0).toLocaleString()} />
			</StatStrip>

			<FilterBar>
				<input className="search-input" style={{ flex: '0 0 260px', height: 32 }} placeholder="Search client / product / source…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
				<FilterSelect ariaLabel="Year" value={year} onChange={(v) => { setYear(v); setPage(1); }} options={yearOpts} allLabel="All years" />
				<span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{(data?.total ?? 0).toLocaleString()} records</span>
				{anyFilter && <button className="btn ghost" onClick={clearAll}><X size={12} /> Clear filters</button>}
				<div style={{ flex: 1 }} />
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add record</button>
			</FilterBar>

			{(creating || editing) && (
				<RecordModal
					record={editing}
					options={options.data}
					onClose={() => { setCreating(false); setEditing(null); }}
					onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
				/>
			)}

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={rows.length === 0} emptyMsg={anyFilter ? 'No records match.' : 'No sales records yet.'} onRetry={refresh}>
					<div className="table-scroll">
						<table className="data-table">
							<thead>
								<tr>
									<SortableTh label="Invoice" field="invoice_date" sort={sort} onSort={setSort} />
									<SortableTh label="Year" field="year" sort={sort} onSort={setSort} />
									<SortableTh label="Quarter" field="quarter" sort={sort} onSort={setSort} />
									<SortableTh label="Invoice / source" field="invoice_source" sort={sort} onSort={setSort} />
									<SortableTh label="Category" field="product_category" sort={sort} onSort={setSort} />
									<SortableTh label="Product / service" field="product_service_name" sort={sort} onSort={setSort} />
									<SortableTh label="Client" field="client_name" sort={sort} onSort={setSort} />
									<SortableTh label="Client type" field="client_type" sort={sort} onSort={setSort} />
									<SortableTh label="Lead source" field="lead_source" sort={sort} onSort={setSort} />
									<SortableTh label="Revenue" field="revenue_amount" sort={sort} onSort={setSort} align="right" />
									<th>Discount</th>
									<th />
								</tr>
								<tr className="filter-row">
									<th />
									<th />
									<th />
									<FilterCell col="invoice_source" filters={filters} onChange={setFilter} />
									<FilterCell col="product_category" filters={filters} onChange={setFilter} />
									<FilterCell col="product_service_name" filters={filters} onChange={setFilter} />
									<FilterCell col="client_name" filters={filters} onChange={setFilter} />
									<FilterCell col="client_type" filters={filters} onChange={setFilter} />
									<FilterCell col="lead_source" filters={filters} onChange={setFilter} />
									<th />
									<th />
									<th />
								</tr>
							</thead>
							<tbody>
								{rows.map((r) => (
									<tr key={r.id}>
										<td>{fmtInvoice(r.invoice_date)}</td>
										<td className="num">{r.year ?? '—'}</td>
										<td>{r.quarter ?? '—'}</td>
										<td>{r.invoice_source ?? '—'}</td>
										<td>{r.product_category ?? '—'}</td>
										<td>{r.product_service_name ?? '—'}</td>
										<td>
											{r.website
												? <a href={r.website.startsWith('http') ? r.website : `https://${r.website}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{r.client_name ?? '—'}</a>
												: (r.client_name ?? '—')}
										</td>
										<td>{r.client_type ?? '—'}</td>
										<td>{r.lead_source ?? '—'}</td>
										<td className="num" style={{ textAlign: 'right' }}>{r.revenue_amount != null ? money(r.revenue_amount, 2) : '—'}</td>
										<td>{r.discount_applied ? 'Yes' : 'No'}</td>
										<td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
											<button className="btn ghost" onClick={() => setEditing(r)}>Edit</button>
											<button className="btn ghost" style={{ color: 'var(--accent)', marginLeft: 6 }} onClick={() => void remove(r.id)}><Trash2 size={12} /></button>
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

function FilterCell({ col, filters, onChange }: { col: string; filters: Record<string, string>; onChange: (col: string, v: string) => void }) {
	return (
		<th style={{ padding: '2px 6px' }}>
			<input className="search-input" style={{ height: 26, width: '100%', minWidth: 90, fontSize: 12, fontWeight: 400 }}
				placeholder="Filter…" value={filters[col] ?? ''} onChange={(e) => onChange(col, e.target.value)} aria-label={`Filter ${col}`} />
		</th>
	);
}

function RecordModal({ record, options, onClose, onSaved }: { record: SalesRecord | null; options?: Options; onClose: () => void; onSaved: () => void }) {
	const [f, setF] = useState<FormState>(record ? { ...record } : { ...EMPTY_FORM });
	const [saving, setSaving] = useState(false);
	const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

	// Date picker → store full ISO, auto-fill Year + Quarter (editable after).
	const onDate = (v: string) => {
		const d = v ? new Date(`${v}T00:00:00`) : null;
		setF((s) => ({
			...s,
			invoice_date: v,
			year: d ? d.getFullYear() : s.year,
			quarter: d ? `Q${Math.floor(d.getMonth() / 3) + 1}` : s.quarter,
		}));
	};
	const dateValue = f.invoice_date && /^\d{4}-\d{2}-\d{2}/.test(f.invoice_date) ? f.invoice_date.slice(0, 10) : '';

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

	const text = (k: keyof FormState, placeholder = '') => (
		<input className="search-input" style={{ height: 34, width: '100%' }} placeholder={placeholder}
			value={(f[k] as string | number | null) ?? ''} onChange={(e) => set(k, e.target.value as FormState[typeof k])} />
	);
	// Autocomplete-from-existing (native datalist) — type-ahead against known
	// values while still allowing a brand-new entry.
	const combo = (k: keyof FormState, list: string[] | undefined) => (
		<>
			<input className="search-input" style={{ height: 34, width: '100%' }} list={`dl-${k}`}
				value={(f[k] as string | null) ?? ''} onChange={(e) => set(k, e.target.value as FormState[typeof k])} />
			<datalist id={`dl-${k}`}>{(list ?? []).map((o) => <option key={o} value={o} />)}</datalist>
		</>
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
				<Field label="Invoice date" hint="auto-fills year & quarter">
					<input className="search-input" type="date" style={{ height: 34, width: '100%' }} value={dateValue} onChange={(e) => onDate(e.target.value)} />
				</Field>
				<Field label="Invoice / source">{combo('invoice_source', options?.invoice_source)}</Field>
				<Field label="Year">
					<input className="search-input" type="number" style={{ height: 34, width: '100%' }} value={f.year ?? ''} onChange={(e) => set('year', e.target.value === '' ? null : Number(e.target.value))} />
				</Field>
				<Field label="Quarter">
					<FilterSelect ariaLabel="Quarter" value={f.quarter ?? ''} onChange={(v) => set('quarter', v)} options={[...QUARTERS]} allLabel="—" />
				</Field>
				<Field label="Client name">{combo('client_name', options?.client_name)}</Field>
				<Field label="Client type">{combo('client_type', options?.client_type)}</Field>
				<Field label="Product / service name">{combo('product_service_name', options?.product_service_name)}</Field>
				<Field label="Product category">{combo('product_category', options?.product_category)}</Field>
				<Field label="Website">{text('website', 'example.com')}</Field>
				<Field label="Lead source">{combo('lead_source', options?.lead_source)}</Field>
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
