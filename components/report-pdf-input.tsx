'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Link2, Loader2, FileText, Check } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase';
import { api } from '@/lib/api';

/**
 * Report PDF picker. Unlike the generic FileInput (which uploads to the public
 * image bucket and stores a public URL), this uploads straight into the PRIVATE
 * `report-pdfs` bucket via a one-time signed upload URL minted by the server,
 * and stores a bucket-relative PATH (e.g. `report-pdfs/uuid.pdf`). The path is
 * served to users through the tier-gated `/api/reports/versions/:id/pdf-url`
 * route (fresh signed URL per request). A URL tab is kept for pasting a legacy
 * Drive/HTTPS link.
 */
interface Props {
	value: string;
	onChange: (v: string) => void;
	maxMb?: number;
}

export function ReportPdfInput({ value, onChange, maxMb = 60 }: Props) {
	const isPath = !!value && !/^https?:\/\//i.test(value);
	const [mode, setMode] = useState<'url' | 'upload'>(isPath ? 'upload' : 'url');
	const [draft, setDraft] = useState(value);
	const [uploading, setUploading] = useState(false);
	const fileRef = useRef<HTMLInputElement>(null);

	const [prev, setPrev] = useState(value);
	if (value !== prev) { setPrev(value); setDraft(value); }

	const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
	const uploadsDisabled = !supabaseUrl || supabaseUrl.includes('localhost') || supabaseUrl.includes('127.0.0.1');
	const commit = () => { if (draft !== value) onChange(draft); };

	const doUpload = async (file: File) => {
		if (uploading) return;
		if (file.type !== 'application/pdf') { toast.error('Please choose a PDF file.'); return; }
		if (file.size > maxMb * 1024 * 1024) { toast.error(`File too large. Max ${maxMb} MB.`); return; }
		setUploading(true);
		try {
			// 1) Ask the server for a one-time signed upload URL into report-pdfs.
			const { bucket, path, token, pdf_url } = await api<{ bucket: string; path: string; token: string; pdf_url: string }>(
				'POST', '/api/admin/reports/pdf-upload-url', { filename: file.name },
			);
			// 2) Upload the bytes straight to storage (no service key in the browser).
			const supabase = getSupabaseBrowser();
			const { error } = await supabase.storage.from(bucket).uploadToSignedUrl(path, token, file, { contentType: 'application/pdf' });
			if (error) throw error;
			// 3) Persist the bucket-relative path; serving mints signed URLs on demand.
			onChange(pdf_url);
			toast.success('PDF uploaded');
		} catch (e) {
			toast.error((e as Error).message || 'Upload failed');
		} finally { setUploading(false); }
	};

	const tabBtn = (active: boolean, disabled = false): React.CSSProperties => ({
		display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', fontSize: 12, border: 0, cursor: disabled ? 'not-allowed' : 'pointer',
		background: active ? 'var(--bg-1)' : 'transparent', color: disabled ? 'var(--fg-muted)' : 'var(--fg)', opacity: disabled ? 0.6 : 1,
	});

	const fileName = value ? value.split('/').pop() : '';
	return (
		<div style={{ display: 'grid', gap: 6 }}>
			<div style={{ display: 'flex', gap: 4, padding: 3, background: 'var(--bg-2)', border: '1px solid var(--border)', width: 'fit-content' }}>
				<button type="button" onClick={() => setMode('url')} style={tabBtn(mode === 'url')}><Link2 size={12} /> URL</button>
				<button type="button" onClick={() => setMode('upload')} disabled={uploadsDisabled} title={uploadsDisabled ? 'Uploads disabled in local dev.' : undefined} style={tabBtn(mode === 'upload', uploadsDisabled)}><Upload size={12} /> Upload PDF</button>
			</div>
			{mode === 'url' ? (
				<div style={{ display: 'flex', gap: 6 }}>
					<input className="search-input" placeholder="https://… PDF or Drive link" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} style={{ flex: 1 }} />
					<button type="button" className="btn" onClick={commit} disabled={draft === value}><Check size={12} /> Save</button>
				</div>
			) : (
				<div>
					<input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(f); e.target.value = ''; }} />
					<button type="button" className="btn ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
						{uploading ? <><Loader2 size={12} style={{ animation: 'rpi-spin 1s linear infinite' }} /> Uploading…</> : <><Upload size={12} /> Choose PDF (max {maxMb} MB)</>}
					</button>
					<style>{'@keyframes rpi-spin { to { transform: rotate(360deg); } }'}</style>
				</div>
			)}
			{value && (
				<div style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
					<FileText size={11} /> {isPath ? <span>{fileName} <span style={{ opacity: 0.6 }}>(stored)</span></span> : <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{fileName}</a>}
				</div>
			)}
		</div>
	);
}
