'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Upload, AlertTriangle } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/modal';

/**
 * Reusable CSV importer for catalog entities. Parses the file client-side and
 * POSTs a JSON row array to /api/admin/import/<entity>. Headers are normalized
 * to snake_case and mapped through per-entity aliases, so human CSVs (e.g.
 * "Company Name", "Round Amount") line up with the backend's expected keys.
 */

type Entity = 'companies' | 'deals' | 'acquisitions' | 'ecosystem';

interface ImportResult { created: number; failed: number; errors: Array<{ index: number; name: string; message: string }> }

// Canonical columns per entity + the help text shown to the admin.
const COLUMNS: Record<Entity, { keys: string[]; help: string }> = {
	companies: { keys: ['name', 'website', 'description', 'sector', 'business_model', 'founded_year', 'country', 'city', 'region', 'continent', 'status'], help: 'name (required), website (required, unique), description, sector, business_model, founded_year, country, city, region, continent, status' },
	deals: { keys: ['company', 'round_type', 'announced_date', 'amount_usd', 'currency_code', 'status'], help: 'company (required — name or website), round_type, announced_date, amount_usd, currency_code, status' },
	acquisitions: { keys: ['acquiree', 'acquirer', 'acquisition_date', 'amount_usd', 'acquisition_type'], help: 'acquiree (required), acquirer, acquisition_date, amount_usd, acquisition_type' },
	ecosystem: { keys: ['name', 'entity_type', 'description', 'website', 'category', 'founded_year', 'country', 'city', 'region', 'continent', 'status'], help: 'name (required), entity_type, description, website, category, founded_year, country, city, region, continent, status' },
};

// Header aliases → canonical key (applied after snake_case normalization).
const ALIASES: Record<string, string> = {
	business_model: 'business_model', biz_model: 'business_model', model: 'business_model',
	founded: 'founded_year', founded_year: 'founded_year', year: 'founded_year', year_founded: 'founded_year',
	company_name: 'company', startup: 'company', company: 'company',
	round: 'round_type', round_type: 'round_type', funding_round: 'round_type', round_name: 'round_type',
	date: 'announced_date', vc_date: 'announced_date', announced_date: 'announced_date', deal_date: 'announced_date',
	amount: 'amount_usd', round_amount: 'amount_usd', amount_usd: 'amount_usd', round_amount_usd: 'amount_usd',
	currency: 'currency_code', currency_code: 'currency_code',
	target: 'acquiree', acquiree: 'acquiree', acquiree_name: 'acquiree',
	buyer: 'acquirer', acquirer: 'acquirer', acquirer_name: 'acquirer',
	type: 'entity_type', entity_type: 'entity_type', acquisition_type: 'acquisition_type',
};

/** Minimal RFC-4180 CSV parser (handles quotes, escaped quotes, CRLF). */
function parseCsv(text: string): Record<string, string>[] {
	const rows: string[][] = [];
	let field = ''; let row: string[] = []; let inQuotes = false;
	const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (inQuotes) {
			if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
			else field += c;
		} else if (c === '"') inQuotes = true;
		else if (c === ',') { row.push(field); field = ''; }
		else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
		else field += c;
	}
	if (field !== '' || row.length) { row.push(field); rows.push(row); }
	if (rows.length < 2) return [];
	const norm = (h: string) => { const k = h.trim().toLowerCase().replace(/[\s-]+/g, '_'); return ALIASES[k] ?? k; };
	const headers = rows[0]!.map(norm);
	return rows.slice(1)
		.filter((r) => r.some((v) => v.trim() !== ''))
		.map((r) => Object.fromEntries(headers.map((h, idx) => [h, (r[idx] ?? '').trim()])));
}

// ── Duplicate detection (client-side in-file key + server-side DB check) ──────
const normWebsite = (v?: string): string => (v ?? '').trim().toLowerCase().replace(/\/+$/, '');
const slugifyName = (v?: string): string => (v ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
function rowKey(entity: Entity, r: Record<string, string>): string {
	if (entity === 'companies') return normWebsite(r.website);
	if (entity === 'ecosystem') return slugifyName(r.name);
	if (entity === 'deals') return [r.company, r.announced_date, r.amount_usd].map((x) => (x ?? '').trim().toLowerCase()).join('|');
	return [r.acquiree, r.acquirer, r.acquisition_date].map((x) => (x ?? '').trim().toLowerCase()).join('|'); // acquisitions
}

export function CsvImportButton({ entity, onDone }: { entity: Entity; onDone: () => void }) {
	const [open, setOpen] = useState(false);
	const [rows, setRows] = useState<Record<string, string>[]>([]);
	const [fileName, setFileName] = useState('');
	const [pending, setPending] = useState(false);
	const [result, setResult] = useState<ImportResult | null>(null);
	// Duplicate review state.
	const [dupInfo, setDupInfo] = useState<Map<number, string>>(new Map());
	const [reviewed, setReviewed] = useState(false);
	const [checking, setChecking] = useState(false);
	const [onlyDupes, setOnlyDupes] = useState(false);
	const [skipDupes, setSkipDupes] = useState(false);

	const cols = COLUMNS[entity].keys;
	const reset = () => { setRows([]); setFileName(''); setResult(null); setDupInfo(new Map()); setReviewed(false); setOnlyDupes(false); setSkipDupes(false); };
	const onFile = async (file: File) => {
		setResult(null); setDupInfo(new Map()); setReviewed(false); setOnlyDupes(false);
		try {
			const parsed = parseCsv(await file.text());
			if (parsed.length === 0) { toast.error('No data rows found in that CSV.'); return; }
			setFileName(file.name); setRows(parsed);
		} catch (e) { toast.error((e as Error).message); }
	};

	const review = async () => {
		setChecking(true);
		const info = new Map<number, string>();
		// In-file duplicates: flag the 2nd+ occurrence of a repeated key.
		const seen = new Map<string, number>();
		rows.forEach((r, i) => {
			const k = rowKey(entity, r);
			if (!k) return;
			if (seen.has(k)) info.set(i, 'Repeated in this file');
			else seen.set(k, i);
		});
		// DB duplicates (companies/ecosystem have a unique key); takes precedence.
		try {
			const res = await api<{ existing: number[] }>('POST', `/api/admin/import/${entity}/check-duplicates`, { rows });
			for (const idx of res.existing) info.set(idx, 'Already in catalog');
		} catch (e) { toast.error((e as Error).message); }
		setDupInfo(info);
		setReviewed(true);
		setChecking(false);
		toast[info.size ? 'warning' : 'success'](info.size ? `${info.size} duplicate row${info.size === 1 ? '' : 's'} found` : 'No duplicates found');
	};

	const submit = async () => {
		setPending(true);
		try {
			const toImport = skipDupes && dupInfo.size ? rows.filter((_, i) => !dupInfo.has(i)) : rows;
			const res = await api<ImportResult>('POST', `/api/admin/import/${entity}`, { rows: toImport });
			setResult(res);
			toast[res.failed ? 'warning' : 'success'](`Imported ${res.created}${res.failed ? ` · ${res.failed} failed` : ''}`);
			if (res.created > 0) onDone();
		} catch (e) { toast.error((e as Error).message); }
		finally { setPending(false); }
	};

	const indexed = rows.map((r, i) => ({ r, i }));
	const shown = (onlyDupes ? indexed.filter((x) => dupInfo.has(x.i)) : indexed).slice(0, 500);
	const importCount = skipDupes && dupInfo.size ? rows.length - dupInfo.size : rows.length;

	return (
		<>
			<button className="btn ghost" onClick={() => { reset(); setOpen(true); }}><Upload size={12} /> Import CSV</button>
			{open && (
				<Modal title={`Import ${entity} from CSV`} width={rows.length ? 920 : 620} onClose={() => setOpen(false)} footer={
					<>
						<button className="btn ghost" onClick={() => setOpen(false)}>Close</button>
						{rows.length > 0 && (
							<button className="btn ghost" disabled={checking} onClick={() => void review()}>
								<AlertTriangle size={12} /> {checking ? 'Reviewing…' : 'Review duplicates'}
							</button>
						)}
						<button className="btn" disabled={importCount === 0 || pending} onClick={() => void submit()}>
							{pending ? 'Importing…' : `Import ${importCount} row${importCount === 1 ? '' : 's'}`}
						</button>
					</>
				}>
					<div style={{ display: 'grid', gap: 12 }}>
						<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
							Columns (case-insensitive, common aliases accepted):<br />
							<span style={{ fontFamily: 'var(--font-mono)' }}>{COLUMNS[entity].help}</span>
						</div>
						<input type="file" accept=".csv,text/csv" className="search-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />

						{rows.length > 0 && (
							<>
								<div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
									<span><strong>{rows.length}</strong> rows parsed from {fileName}</span>
									{reviewed && (
										<span style={{ color: dupInfo.size ? 'var(--accent)' : 'var(--pos)', fontWeight: 600 }}>
											· {dupInfo.size} duplicate{dupInfo.size === 1 ? '' : 's'}
										</span>
									)}
									<div style={{ flex: 1 }} />
									{reviewed && dupInfo.size > 0 && (
										<>
											<label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
												<input type="checkbox" checked={onlyDupes} onChange={(e) => setOnlyDupes(e.target.checked)} /> Only duplicates
											</label>
											<label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
												<input type="checkbox" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} /> Skip duplicates on import
											</label>
										</>
									)}
								</div>

								<div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
									<table className="data-table" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
										<thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-1)' }}>
											<tr>
												<th style={{ position: 'sticky', left: 0, background: 'var(--bg-1)' }}>#</th>
												{reviewed && <th>Status</th>}
												{cols.map((k) => <th key={k}>{k}</th>)}
											</tr>
										</thead>
										<tbody>
											{shown.map(({ r, i }) => {
												const dup = dupInfo.get(i);
												return (
													<tr key={i} style={dup ? { background: 'color-mix(in srgb, var(--accent) 14%, transparent)' } : undefined}>
														<td className="num" style={{ position: 'sticky', left: 0, background: dup ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'var(--bg-1)', color: 'var(--fg-muted)' }}>{i + 1}</td>
														{reviewed && <td style={{ color: dup ? 'var(--accent)' : 'var(--pos)', fontWeight: 600 }}>{dup ?? 'OK'}</td>}
														{cols.map((k) => <td key={k}>{r[k] ?? ''}</td>)}
													</tr>
												);
											})}
										</tbody>
									</table>
								</div>
								{shown.length < (onlyDupes ? dupInfo.size : rows.length) && (
									<div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Showing first {shown.length} of {onlyDupes ? dupInfo.size : rows.length} rows.</div>
								)}
							</>
						)}

						{result && (
							<div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 12 }}>
								<div style={{ fontWeight: 600 }}>{result.created} created · {result.failed} failed</div>
								{result.errors.length > 0 && (
									<div style={{ marginTop: 6, maxHeight: 160, overflow: 'auto', color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
										{result.errors.map((er) => <div key={er.index}>row {er.index + 1} ({er.name}): {er.message}</div>)}
									</div>
								)}
							</div>
						)}
					</div>
				</Modal>
			)}
		</>
	);
}
