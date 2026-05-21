'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Trash2, FileText, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';

interface Report {
	id: string;
	title: string;
	slug?: string;
	report_type?: string;
	pages?: number;
	is_free?: boolean;
	published_at?: string;
	has_sections?: boolean;
	is_published?: boolean;
}
interface Response { data: Report[]; total: number }

export default function ReportsAdminPage() {
	const { mutate } = useSWRConfig();
	const [draft, setDraft] = useState({ title: '', short_title: '', description: '', drive_link: '', pages: 0, has_sections: true });
	const [createPending, setCreatePending] = useState(false);
	const [removePending, setRemovePending] = useState(false);
	const { data } = useSWR<Response>(['/api/reports'], { dedupingInterval: 30_000 });

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/reports');

	const create = async () => {
		setCreatePending(true);
		try {
			// has_sections is a NEW column on reports — the legacy CRUD endpoint
			// doesn't know about it, so we POST to create + PATCH /flags to set it.
			const { has_sections, ...legacy } = draft;
			const created = await api<{ id: string }>('POST', '/api/admin/reports', { ...legacy, pages: draft.pages || undefined });
			if (has_sections) {
				await api('PATCH', `/api/admin/reports/${created.id}/flags`, { has_sections: true });
			}
			toast.success('Report created');
			setDraft({ title: '', short_title: '', description: '', drive_link: '', pages: 0, has_sections: true });
			void refresh();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setCreatePending(false);
		}
	};
	const remove = async (id: string) => {
		setRemovePending(true);
		try {
			await api('DELETE', `/api/admin/reports/${id}`);
			toast.success('Deleted');
			void refresh();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setRemovePending(false);
		}
	};
	const togglePublished = async (id: string, next: boolean) => {
		try {
			await api('PATCH', `/api/admin/reports/${id}/flags`, { is_published: next });
			toast.success(next ? 'Published' : 'Moved to draft');
			void refresh();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	const reports = data?.data ?? [];
	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
					Library · {(data?.total ?? 0).toLocaleString()} reports
				</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>Reports</h1>
			</div>

			<div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
				<div style={{ fontWeight: 700, marginBottom: 12 }}>Publish a new report</div>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
					<input className="search-input" placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
					<input className="search-input" placeholder="Short title" value={draft.short_title} onChange={(e) => setDraft({ ...draft, short_title: e.target.value })} />
					<input className="search-input" placeholder="Drive PDF link" value={draft.drive_link} onChange={(e) => setDraft({ ...draft, drive_link: e.target.value })} />
					<input className="search-input" type="number" placeholder="Pages" value={draft.pages || ''} onChange={(e) => setDraft({ ...draft, pages: Number(e.target.value) })} />
				</div>
				<textarea
					className="search-input"
					placeholder="Description"
					value={draft.description}
					onChange={(e) => setDraft({ ...draft, description: e.target.value })}
					style={{ width: '100%', marginTop: 8, minHeight: 80, resize: 'vertical' }}
				/>
				<label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 13 }}>
					<input
						type="checkbox"
						checked={draft.has_sections}
						onChange={(e) => setDraft({ ...draft, has_sections: e.target.checked })}
					/>
					Sections-based report (in-app composable content). Uncheck for legacy PDF-link reports.
				</label>
				<button className="btn" style={{ marginTop: 10 }} disabled={!draft.title || createPending} onClick={() => void create()}>Create</button>
			</div>

			<div className="card">
				<table className="data-table">
					<thead><tr><th>Title</th><th>Model</th><th>Pages</th><th>Status</th><th style={{ textAlign: 'right' }}></th></tr></thead>
					<tbody>
						{reports.map((r) => (
							<tr key={r.id}>
								<td>{r.title}</td>
								<td>{r.has_sections ? <span className="tag pos">sections</span> : <span className="tag">pdf</span>}</td>
								<td className="num">{r.pages ?? '—'}</td>
								<td>{r.is_published === false ? <span className="tag">draft</span> : <span className="tag pos">published</span>}</td>
								<td style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
									{r.has_sections && (
										<Link href={`/reports/${r.id}`} className="btn ghost" title="Edit sections">
											<FileText size={12} /> Sections
										</Link>
									)}
									<button
										className="btn ghost"
										onClick={() => void togglePublished(r.id, r.is_published === false)}
										title={r.is_published === false ? 'Publish' : 'Move to draft'}
									>
										{r.is_published === false ? <><Eye size={12} /> Publish</> : <><EyeOff size={12} /> Unpublish</>}
									</button>
									<button className="btn ghost" disabled={removePending} onClick={() => { if (confirm(`Delete ${r.title}?`)) void remove(r.id); }}>
										<Trash2 size={12} />
									</button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
