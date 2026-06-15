'use client';

import { useRef } from 'react';
import { Upload, FileDown } from 'lucide-react';
import { downloadCsv } from './csv-import';

/**
 * Shared input pane for the lightweight "candidate" importers (startups
 * pipeline, investor review). Accepts pasted lines or an uploaded CSV/TXT,
 * shows a live parsed table preview, and offers a template download. The
 * per-queue dedupe/import flow stays in each page; this only owns the input.
 *
 * Each line is "Name, https://website" (comma/tab splits the two) or a bare
 * URL/name.
 */

export interface Candidate { name: string; website?: string }

export function parseCandidates(text: string): Candidate[] {
	return text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
		const [a, b] = line.split(/[,\t]/).map((s) => s.trim());
		if (b) return { name: a, website: b };
		if (/^https?:\/\//i.test(a)) return { name: a.replace(/^https?:\/\//, '').replace(/\/.*$/, ''), website: a };
		return { name: a };
	});
}

export function CandidateInput({
	text, onText, placeholder, sampleName,
}: { text: string; onText: (t: string) => void; placeholder?: string; sampleName: string }) {
	const fileRef = useRef<HTMLInputElement>(null);
	const onFile = (file: File) => { const r = new FileReader(); r.onload = () => onText(String(r.result ?? '')); r.readAsText(file); };
	const rows = parseCandidates(text);
	const template = () => downloadCsv('candidates-template.csv', ['Name', 'Website'], [
		[sampleName, 'https://example.com'],
		[`${sampleName} Two`, 'https://example.io'],
	]);

	return (
		<div style={{ display: 'grid', gap: 8 }}>
			<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>One per line: <code>Name, https://website</code> or plain URLs. Upload a CSV/TXT or paste below.</div>
			<input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
			<div style={{ display: 'flex', gap: 8 }}>
				<button type="button" className="btn ghost" onClick={() => fileRef.current?.click()}><Upload size={12} /> Upload CSV / TXT</button>
				<button type="button" className="btn ghost" onClick={template}><FileDown size={12} /> Download template</button>
			</div>
			<textarea
				className="search-input"
				style={{ minHeight: 150, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }}
				value={text}
				onChange={(e) => onText(e.target.value)}
				placeholder={placeholder}
			/>
			{rows.length > 0 && (
				<div>
					<div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 4 }}>{rows.length} parsed · preview</div>
					<div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
						<table className="data-table" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
							<thead style={{ position: 'sticky', top: 0, background: 'var(--bg-1)' }}><tr><th style={{ width: 28 }}>#</th><th>Name</th><th>Website</th></tr></thead>
							<tbody>
								{rows.slice(0, 200).map((r, i) => (
									<tr key={i}>
										<td className="num" style={{ color: 'var(--fg-muted)' }}>{i + 1}</td>
										<td>{r.name || <span style={{ color: 'var(--accent)' }}>—</span>}</td>
										<td style={{ color: 'var(--fg-muted)' }}>{r.website ?? '—'}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{rows.length > 200 && <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>Showing first 200 of {rows.length}.</div>}
				</div>
			)}
		</div>
	);
}
