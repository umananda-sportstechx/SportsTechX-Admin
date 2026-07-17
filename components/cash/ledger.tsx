'use client';

import { useMemo, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Trash2, Download, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useConfirm } from '@/components/confirm';
import { Modal } from '@/components/modal';
import { Field } from '@/components/tabbed-form';
import { AsyncState, StatCard, Pager, SortableTh, Tag } from '@/components/atoms';
import { FilterBar, FilterSelect, StatStrip } from '@/components/filters';
import { Select } from '@/components/select';
import { CATEGORIES, BUSINESS_AREAS, STATUSES } from './constants';

interface Txn {
	id: string; date: string | null; description: string; category: string | null; amount_eur: number;
	status: string | null; counterparty: string | null; business_area: string | null;
	due_date: string | null; actual_payment_date: string | null; recurrence: string | null;
}
const money = (n: number) => `${n < 0 ? '-' : ''}€${Math.abs(Math.round(n)).toLocaleString('de-DE')}`;
const PER = 20;
type Form = Partial<Txn>;
const EMPTY: Form = { date: '', description: '', category: 'Other / Uncategorized', amount_eur: 0, status: 'Expected', counterparty: '', business_area: null, due_date: '', actual_payment_date: '', recurrence: '' };

export function CashLedger() {
	const { mutate: gm } = useSWRConfig();
	const ask = useConfirm();
	const { data, error, isLoading } = useSWR<Txn[]>(['/api/cash/transactions'], { dedupingInterval: 15_000 });
	const [search, setSearch] = useState('');
	const debSearch = useDebouncedValue(search);
	const [status, setStatus] = useState('');
	const [category, setCategory] = useState('');
	const [area, setArea] = useState('');
	const [month, setMonth] = useState('');
	const [sort, setSort] = useState('-date');
	const [page, setPage] = useState(1);
	const [editing, setEditing] = useState<Txn | null>(null);
	const [creating, setCreating] = useState(false);

	const refresh = () => gm((k) => Array.isArray(k) && String(k[0]).startsWith('/api/cash'));
	const rows = data ?? [];
	const months = useMemo(() => [...new Set(rows.map((r) => (r.date ?? '').slice(0, 7)).filter(Boolean))].sort().reverse(), [rows]);

	const filtered = useMemo(() => {
		let r = rows;
		if (debSearch) { const q = debSearch.toLowerCase(); r = r.filter((x) => `${x.description} ${x.counterparty ?? ''} ${x.category ?? ''}`.toLowerCase().includes(q)); }
		if (status) r = r.filter((x) => x.status === status);
		if (category) r = r.filter((x) => x.category === category);
		if (area) r = r.filter((x) => area === '__none' ? !x.business_area : x.business_area === area);
		if (month) r = r.filter((x) => (x.date ?? '').startsWith(month));
		const desc = sort.startsWith('-'); const col = (desc ? sort.slice(1) : sort) as keyof Txn;
		r = [...r].sort((a, b) => {
			const av = a[col] ?? '', bv = b[col] ?? '';
			const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
			return desc ? -cmp : cmp;
		});
		return r;
	}, [rows, debSearch, status, category, area, month, sort]);

	const totalPages = Math.max(1, Math.ceil(filtered.length / PER));
	const pageRows = filtered.slice((page - 1) * PER, page * PER);
	const net = filtered.reduce((s, r) => s + r.amount_eur, 0);
	const anyFilter = !!(search || status || category || area || month);

	const remove = async (id: string) => {
		if (!(await ask({ message: 'Delete this transaction?', danger: true, confirmLabel: 'Delete' }))) return;
		try { await api('DELETE', `/api/cash/transactions/${id}`); toast.success('Deleted'); refresh(); } catch (e) { toast.error((e as Error).message); }
	};

	const exportCsv = () => {
		const cols = ['date', 'description', 'counterparty', 'category', 'business_area', 'amount_eur', 'status', 'due_date', 'actual_payment_date', 'recurrence'];
		const lines = [cols.join(',')];
		for (const r of filtered) lines.push(cols.map((c) => `"${String((r as unknown as Record<string, unknown>)[c] ?? '').replace(/"/g, '""')}"`).join(','));
		const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' })); a.download = `cash_transactions_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
	};

	return (
		<div>
			<StatStrip cols={3}>
				<StatCard label="Transactions" loading={isLoading} value={rows.length.toLocaleString()} />
				<StatCard label="Net (filtered)" value={money(net)} tone={net < 0 ? 'rose' : 'green'} />
				<StatCard label="Showing" value={filtered.length.toLocaleString()} />
			</StatStrip>

			<FilterBar>
				<input className="search-input" style={{ flex: '0 0 200px', height: 32 }} placeholder="Search description / counterparty…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
				<FilterSelect ariaLabel="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} allLabel="All statuses" options={[...STATUSES]} />
				<FilterSelect ariaLabel="Category" value={category} onChange={(v) => { setCategory(v); setPage(1); }} allLabel="All categories" options={[...CATEGORIES]} />
				<FilterSelect ariaLabel="Area" value={area} onChange={(v) => { setArea(v); setPage(1); }} allLabel="All areas" options={[{ value: '__none', label: 'None' }, ...BUSINESS_AREAS.map((a) => ({ value: a, label: a }))]} />
				<FilterSelect ariaLabel="Month" value={month} onChange={(v) => { setMonth(v); setPage(1); }} allLabel="All months" options={months} />
				{anyFilter && <button className="btn ghost" onClick={() => { setSearch(''); setStatus(''); setCategory(''); setArea(''); setMonth(''); setPage(1); }}><X size={12} /> Clear</button>}
				<div style={{ flex: 1 }} />
				<button className="btn ghost" onClick={exportCsv}><Download size={12} /> Export</button>
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> New transaction</button>
			</FilterBar>

			{(creating || editing) && <TxnModal txn={editing} onClose={() => { setCreating(false); setEditing(null); }} onSaved={() => { setCreating(false); setEditing(null); refresh(); }} />}

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={filtered.length === 0} emptyMsg={anyFilter ? 'No transactions match.' : 'No transactions yet.'} onRetry={refresh}>
					<div className="table-scroll">
						<table className="data-table">
							<thead><tr>
								<SortableTh label="Date" field="date" sort={sort} onSort={setSort} />
								<SortableTh label="Description" field="description" sort={sort} onSort={setSort} />
								<SortableTh label="Counterparty" field="counterparty" sort={sort} onSort={setSort} />
								<SortableTh label="Category" field="category" sort={sort} onSort={setSort} />
								<th>Area</th>
								<SortableTh label="Amount" field="amount_eur" sort={sort} onSort={setSort} align="right" />
								<th>Status</th><th>Due</th><th />
							</tr></thead>
							<tbody>
								{pageRows.map((r) => (
									<tr key={r.id}>
										<td>{(r.date ?? '').slice(0, 10) || '—'}</td>
										<td>{r.description || '—'}</td>
										<td>{r.counterparty ?? '—'}</td>
										<td>{r.category ?? '—'}</td>
										<td>{r.business_area ?? '—'}</td>
										<td className="num" style={{ textAlign: 'right', color: r.amount_eur < 0 ? 'var(--neg)' : 'var(--pos)', fontWeight: 600 }}>{money(r.amount_eur)}</td>
										<td><Tag variant={r.status === 'Actual' ? 'pos' : 'warn'}>{r.status ?? '—'}</Tag></td>
										<td>{(r.due_date ?? '').slice(0, 10) || '—'}</td>
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
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 12 }}>
				<span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Net (filtered): <strong style={{ color: net < 0 ? 'var(--neg)' : 'var(--pos)' }}>{money(net)}</strong> · {filtered.length} rows</span>
				<Pager page={page} totalPages={totalPages} onPage={setPage} />
			</div>
		</div>
	);
}

function TxnModal({ txn, onClose, onSaved }: { txn: Txn | null; onClose: () => void; onSaved: () => void }) {
	const [f, setF] = useState<Form>(txn ? { ...txn, date: (txn.date ?? '').slice(0, 10), due_date: (txn.due_date ?? '').slice(0, 10), actual_payment_date: (txn.actual_payment_date ?? '').slice(0, 10) } : { ...EMPTY });
	const [saving, setSaving] = useState(false);
	const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

	const save = async () => {
		if (!f.date || !f.description) { toast.error('Date and description are required'); return; }
		setSaving(true);
		try {
			const body = { ...f, amount_eur: Number(f.amount_eur ?? 0), due_date: f.due_date || null, actual_payment_date: f.actual_payment_date || null };
			if (txn) await api('PATCH', `/api/cash/transactions/${txn.id}`, body);
			else await api('POST', '/api/cash/transactions', body);
			toast.success(txn ? 'Updated' : 'Added');
			onSaved();
		} catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
	};

	const dateInput = (k: keyof Form) => <input className="search-input" type="date" style={{ height: 34, width: '100%' }} value={(f[k] as string) ?? ''} onChange={(e) => set(k, e.target.value as never)} />;

	return (
		<Modal title={txn ? 'Edit transaction' : 'New transaction'} width={640} onClose={onClose}
			footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button></>}>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
				<Field label="Date">{dateInput('date')}</Field>
				<Field label="Amount (€)"><input className="search-input" type="number" step="0.01" style={{ height: 34, width: '100%' }} value={f.amount_eur ?? ''} onChange={(e) => set('amount_eur', e.target.value === '' ? 0 : Number(e.target.value))} /></Field>
				<div style={{ gridColumn: '1 / -1' }}><Field label="Description"><input className="search-input" style={{ height: 34, width: '100%' }} value={f.description ?? ''} onChange={(e) => set('description', e.target.value)} /></Field></div>
				<Field label="Counterparty"><input className="search-input" style={{ height: 34, width: '100%' }} value={f.counterparty ?? ''} onChange={(e) => set('counterparty', e.target.value)} /></Field>
				<Field label="Status"><Select value={f.status ?? 'Expected'} onChange={(v) => set('status', v)} width="100%" style={{ display: 'block', width: '100%' }} options={STATUSES.map((s) => ({ value: s, label: s }))} /></Field>
				<Field label="Category"><Select value={f.category ?? ''} onChange={(v) => set('category', v)} searchable width="100%" style={{ display: 'block', width: '100%' }} options={CATEGORIES.map((c) => ({ value: c, label: c }))} /></Field>
				<Field label="Business area"><Select value={f.business_area ?? ''} onChange={(v) => set('business_area', v || null)} width="100%" style={{ display: 'block', width: '100%' }} placeholder="None" options={[{ value: '', label: 'None' }, ...BUSINESS_AREAS.map((a) => ({ value: a, label: a }))]} /></Field>
				<Field label="Due date">{dateInput('due_date')}</Field>
				<Field label="Actual payment date">{dateInput('actual_payment_date')}</Field>
				<Field label="Recurrence"><input className="search-input" style={{ height: 34, width: '100%' }} placeholder="e.g. monthly" value={f.recurrence ?? ''} onChange={(e) => set('recurrence', e.target.value)} /></Field>
			</div>
		</Modal>
	);
}
