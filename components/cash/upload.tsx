'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Upload, ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { Select } from '@/components/select';
import { CATEGORIES, BUSINESS_AREAS } from './constants';

// Qonto bank-statement CSV importer — dedups against existing rows and matches
// pending "Expected" rows to flip them to "Actual". Ported from cash-upload-tab.
const COL_MAP: Record<string, string[]> = {
	date: ['settlement_date', 'date', 'transaction_date'],
	description: ['reference', 'note', 'description'],
	counterparty: ['counterparty', 'counterparty_name'],
	amount: ['amount', 'amount_eur'],
	txn_id: ['transaction_id', 'id'],
};
const findCol = (headers: string[], keys: string[]) => headers.findIndex((h) => keys.includes(h.trim().toLowerCase()));

function splitCsv(line: string): string[] {
	const out: string[] = []; let cur = ''; let q = false;
	for (let i = 0; i < line.length; i++) { const c = line[i]; if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else { if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } }
	out.push(cur); return out;
}
// Non-crypto rolling hash — matches the legacy client makeHash so re-uploads of
// rows previously imported through this tool are recognised as duplicates.
function rollHash(s: string): string { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return 'h' + Math.abs(h).toString(16).padStart(8, '0'); }
const makeHash = (date: string, amount: number, cp: string, desc: string) => rollHash(`${date}|${amount.toFixed(2)}|${cp}|${desc}`);

interface Row {
	date: string; description: string; counterparty: string; amount: number; hash: string;
	category: string; business_area: string | null; matchedId: string | null; selected: boolean;
}
interface Skipped { date: string; description: string; counterparty: string; amount: number; reason: string }
interface Existing { id: string; status: string | null; counterparty: string | null; amount_eur: number; import_hash: string | null }

export function CashUpload() {
	const [step, setStep] = useState<'idle' | 'review' | 'done'>('idle');
	const [rows, setRows] = useState<Row[]>([]);
	const [skipped, setSkipped] = useState<Skipped[]>([]);
	const [showSkipped, setShowSkipped] = useState(false);
	const [busy, setBusy] = useState(false);
	const [result, setResult] = useState<{ inserted: number; updated: number; errors: string[] } | null>(null);

	const process = async (file: File) => {
		const text = await file.text();
		const lines = text.split(/\r?\n/).filter((l) => l.trim());
		if (lines.length < 2) { toast.error('Empty CSV'); return; }
		const headers = splitCsv(lines[0]);
		const iDate = findCol(headers, COL_MAP.date), iAmt = findCol(headers, COL_MAP.amount);
		if (iDate < 0 || iAmt < 0) { toast.error('CSV needs date + amount columns'); return; }
		const iDesc = findCol(headers, COL_MAP.description), iCp = findCol(headers, COL_MAP.counterparty);

		let rules: Array<{ counterparty: string; category: string; business_area: string }> = [];
		let existing: Existing[] = [];
		try {
			[rules, existing] = await Promise.all([
				api<Array<{ counterparty: string; category: string; business_area: string }>>('GET', '/api/cash/counterparty-rules'),
				api<Existing[]>('GET', '/api/cash/transactions'),
			]);
		} catch (e) { toast.error((e as Error).message); return; }

		const ruleMap: Record<string, { category: string; business_area: string }> = {};
		for (const r of rules) ruleMap[(r.counterparty ?? '').toLowerCase()] = { category: r.category, business_area: r.business_area };
		const existingHashes = new Set(existing.map((e) => e.import_hash).filter(Boolean));
		const existingExpected = existing.filter((e) => e.status === 'Expected');

		const out: Row[] = []; const skip: Skipped[] = [];
		for (let i = 1; i < lines.length; i++) {
			const cells = splitCsv(lines[i]);
			const date = (cells[iDate] ?? '').slice(0, 10);
			const amount = parseFloat((cells[iAmt] ?? '').replace(/[^0-9.-]/g, ''));
			if (!date || isNaN(amount)) continue;
			const description = iDesc >= 0 ? (cells[iDesc] ?? '') : '';
			const counterparty = iCp >= 0 ? (cells[iCp] ?? '') : '';
			const hash = makeHash(date, amount, counterparty, description);
			if (existingHashes.has(hash)) { skip.push({ date, description, counterparty, amount, reason: 'Already imported (hash match)' }); continue; }
			const matched = existingExpected.find((e) => (e.counterparty ?? '').toLowerCase() === counterparty.toLowerCase() && Math.abs(e.amount_eur - amount) <= 1);
			const rule = ruleMap[counterparty.toLowerCase()];
			out.push({ date, description, counterparty, amount, hash, category: rule?.category ?? 'Other / Uncategorized', business_area: rule?.business_area ?? null, matchedId: matched?.id ?? null, selected: true });
		}
		setRows(out); setSkipped(skip); setStep('review');
	};

	const commit = async () => {
		const chosen = rows.filter((r) => r.selected);
		const updates = chosen.filter((r) => r.matchedId).map((r) => ({ id: r.matchedId!, actual_payment_date: r.date }));
		const inserts = chosen.filter((r) => !r.matchedId).map((r) => ({ date: r.date, description: r.description, counterparty: r.counterparty, amount_eur: r.amount, category: r.category, business_area: r.business_area, status: 'Actual', actual_payment_date: r.date, import_hash: r.hash }));
		setBusy(true);
		try {
			const res = await api<{ inserted: number; updated: number; errors: string[] }>('POST', '/api/cash/transactions/batch', { updates, inserts });
			setResult(res); setStep('done');
		} catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
	};

	if (step === 'done') return (
		<div className="card" style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
			<div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>Import complete</div>
			<div style={{ display: 'flex', gap: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
				<div><div style={{ fontSize: 28, fontWeight: 800, color: 'var(--pos)' }}>{result?.inserted ?? 0}</div><div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>New rows</div></div>
				<div><div style={{ fontSize: 28, fontWeight: 800, color: 'oklch(55% 0.18 250)' }}>{result?.updated ?? 0}</div><div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Expected → Actual</div></div>
				<div><div style={{ fontSize: 28, fontWeight: 800, color: (result?.errors.length ?? 0) ? 'var(--neg)' : 'var(--fg-muted)' }}>{result?.errors.length ?? 0}</div><div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Errors</div></div>
			</div>
			<button className="btn" style={{ marginTop: 16 }} onClick={() => { setStep('idle'); setRows([]); setSkipped([]); setResult(null); }}>Import another</button>
		</div>
	);

	if (step === 'idle') return (
		<div className="card" style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
			<Upload size={28} style={{ color: 'var(--fg-muted)', margin: '0 auto 12px' }} />
			<div style={{ fontWeight: 700, marginBottom: 4 }}>Upload a Qonto CSV export</div>
			<div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 16 }}>Auto-categorizes via counterparty rules, skips duplicates, and matches pending Expected rows.</div>
			<input type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void process(f); }} />
		</div>
	);

	const selCount = rows.filter((r) => r.selected).length;
	const setRow = (i: number, patch: Partial<Row>) => setRows((prev) => prev.map((r, j) => j === i ? { ...r, ...patch } : r));
	return (
		<div style={{ display: 'grid', gap: 'var(--space-4)' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
				<div style={{ fontSize: 13 }}>{rows.length} rows to process · {skipped.length} duplicates skipped · <strong>{selCount} selected</strong></div>
				<div style={{ display: 'flex', gap: 8 }}>
					<button className="btn ghost" onClick={() => setStep('idle')}>Back</button>
					<button className="btn" disabled={busy || selCount === 0} onClick={() => void commit()}>{busy ? 'Importing…' : `Import ${selCount}`}</button>
				</div>
			</div>
			<div className="card">
				<div className="table-scroll">
					<table className="data-table">
						<thead><tr>
							<th style={{ width: 30 }}><input type="checkbox" checked={rows.length > 0 && rows.every((r) => r.selected)} onChange={(e) => setRows((prev) => prev.map((r) => ({ ...r, selected: e.target.checked })))} /></th>
							<th>Date</th><th>Description</th><th>Counterparty</th><th style={{ textAlign: 'right' }}>Amount</th><th>Category</th><th>Area</th><th>Action</th>
						</tr></thead>
						<tbody>
							{rows.map((r, i) => (
								<tr key={i}>
									<td><input type="checkbox" checked={r.selected} onChange={(e) => setRow(i, { selected: e.target.checked })} /></td>
									<td>{r.date}</td>
									<td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.description}>{r.description || '—'}</td>
									<td>{r.counterparty || '—'}</td>
									<td className="num" style={{ textAlign: 'right', color: r.amount < 0 ? 'var(--neg)' : 'var(--pos)' }}>{r.amount < 0 ? '-' : ''}€{Math.abs(Math.round(r.amount)).toLocaleString('de-DE')}</td>
									<td><Select value={r.category} onChange={(v) => setRow(i, { category: v })} searchable width={180} options={CATEGORIES.map((c) => ({ value: c, label: c }))} /></td>
									<td><Select value={r.business_area ?? ''} onChange={(v) => setRow(i, { business_area: v || null })} width={120} placeholder="None" options={[{ value: '', label: 'None' }, ...BUSINESS_AREAS.map((a) => ({ value: a, label: a }))]} /></td>
									<td><span className="tag" style={r.matchedId ? { color: 'oklch(55% 0.18 250)', borderColor: 'oklch(55% 0.18 250)' } : { color: 'var(--pos)', borderColor: 'var(--pos)' }}>{r.matchedId ? 'Expected → Actual' : 'Insert'}</span></td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</div>
			{skipped.length > 0 && (
				<div className="card" style={{ padding: 'var(--space-3)' }}>
					<button className="btn ghost" onClick={() => setShowSkipped((s) => !s)}>{showSkipped ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {skipped.length} skipped duplicates</button>
					{showSkipped && (
						<div className="table-scroll" style={{ marginTop: 8 }}>
							<table className="data-table"><thead><tr><th>Date</th><th>Description</th><th>Counterparty</th><th style={{ textAlign: 'right' }}>Amount</th><th>Reason</th></tr></thead>
								<tbody>{skipped.map((s, i) => <tr key={i}><td>{s.date}</td><td>{s.description || '—'}</td><td>{s.counterparty || '—'}</td><td className="num" style={{ textAlign: 'right' }}>€{Math.abs(Math.round(s.amount)).toLocaleString('de-DE')}</td><td style={{ color: 'var(--fg-muted)' }}>{s.reason}</td></tr>)}</tbody>
							</table>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
