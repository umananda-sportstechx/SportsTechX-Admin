'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Link2, Loader2, FileText, Check } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase';

/**
 * Document picker (PDFs etc.) — URL tab to paste a link, or Upload tab to send a
 * file to Supabase Storage. Sibling of ImageInput but for non-image files, so it
 * doesn't disturb the image-only validation/preview of that shared component.
 * Lands at `${pathPrefix}/${uuid}.${ext}` in the bucket; the public URL is
 * written back via onChange.
 */
interface FileInputProps {
	value: string;
	onChange: (url: string) => void;
	pathPrefix: string;
	bucket?: string;
	accept?: string;
	maxMb?: number;
	placeholder?: string;
}

export function FileInput({
	value, onChange, pathPrefix, bucket = 'public-images',
	accept = 'application/pdf', maxMb = 20, placeholder = 'https://… (PDF link)',
}: FileInputProps) {
	const [mode, setMode] = useState<'url' | 'upload'>(value && value.includes('/storage/v1/object/public/') ? 'upload' : 'url');
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
		if (accept && !accept.split(',').map((s) => s.trim()).includes(file.type)) {
			toast.error(`Unsupported type ${file.type || '(unknown)'}. Allowed: ${accept}.`); return;
		}
		if (file.size > maxMb * 1024 * 1024) { toast.error(`File too large. Max ${maxMb} MB.`); return; }
		setUploading(true);
		try {
			const supabase = getSupabaseBrowser();
			const ext = (file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? 'pdf').toLowerCase();
			const key = `${pathPrefix.replace(/\/$/, '')}/${crypto.randomUUID()}.${ext}`;
			const { error } = await supabase.storage.from(bucket).upload(key, file, { cacheControl: '31536000', upsert: false, contentType: file.type });
			if (error) throw error;
			const { data: pub } = supabase.storage.from(bucket).getPublicUrl(key);
			onChange(pub.publicUrl);
			toast.success('Uploaded');
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
				<button type="button" onClick={() => setMode('upload')} disabled={uploadsDisabled} title={uploadsDisabled ? 'Uploads disabled in local dev.' : undefined} style={tabBtn(mode === 'upload', uploadsDisabled)}><Upload size={12} /> Upload</button>
			</div>
			{mode === 'url' ? (
				<div style={{ display: 'flex', gap: 6 }}>
					<input className="search-input" type="url" placeholder={placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} style={{ flex: 1 }} />
					<button type="button" className="btn" onClick={commit} disabled={draft === value}><Check size={12} /> Save</button>
				</div>
			) : (
				<div>
					<input ref={fileRef} type="file" accept={accept} style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void doUpload(f); e.target.value = ''; }} />
					<button type="button" className="btn ghost" disabled={uploading} onClick={() => fileRef.current?.click()}>
						{uploading ? <><Loader2 size={12} style={{ animation: 'fi-spin 1s linear infinite' }} /> Uploading…</> : <><Upload size={12} /> Choose file</>}
					</button>
					<style>{'@keyframes fi-spin { to { transform: rotate(360deg); } }'}</style>
				</div>
			)}
			{value && <div style={{ fontSize: 11, color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 4 }}><FileText size={11} /> <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{fileName}</a></div>}
		</div>
	);
}
