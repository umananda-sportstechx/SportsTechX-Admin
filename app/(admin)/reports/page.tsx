'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { api } from '@/lib/api';

interface Report {
	id: string;
	title: string;
	slug?: string;
	report_type?: string;
	pages?: number;
	is_free?: boolean;
	published_at?: string;
}
interface Response { data: Report[]; total: number }

export default function ReportsAdminPage() {
	const { mutate } = useSWRConfig();
	const [draft, setDraft] = useState({ title: '', short_title: '', description: '', drive_link: '', pages: 0 });
	const [createPending, setCreatePending] = useState(false);
	const [removePending, setRemovePending] = useState(false);
	const { data } = useSWR<Response>(['/api/reports'], { dedupingInterval: 30_000 });

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/reports');

	const create = async () => {
		setCreatePending(true);
		try {
			await api('POST', '/api/admin/reports', { ...draft, pages: draft.pages || undefined });
			toast.success('Report published');
			setDraft({ title: '', short_title: '', description: '', drive_link: '', pages: 0 });
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
				<button className="btn" style={{ marginTop: 10 }} disabled={!draft.title || createPending} onClick={() => void create()}>Publish</button>
			</div>

			<div className="card">
				<table className="data-table">
					<thead><tr><th>Title</th><th>Type</th><th>Pages</th><th>Free?</th><th>Published</th><th style={{ textAlign: 'right' }}></th></tr></thead>
					<tbody>
						{reports.map((r) => (
							<tr key={r.id}>
								<td>{r.title}</td>
								<td>{r.report_type ?? '—'}</td>
								<td className="num">{r.pages ?? '—'}</td>
								<td>{r.is_free ? <span className="tag pos">free</span> : <span className="tag">paid</span>}</td>
								<td className="num">{r.published_at ? new Date(r.published_at).toLocaleDateString() : '—'}</td>
								<td style={{ textAlign: 'right' }}>
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
