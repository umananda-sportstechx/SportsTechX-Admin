'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Trash2, FileText, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader, AsyncState } from '@/components/atoms';
import { YearSelect } from '@/components/year-select';

interface Report {
	id: string;
	title: string;
	slug?: string;
	report_month?: number | null;
	report_year?: number | null;
	show_on_dashboard?: boolean;
	has_sections?: boolean;
	is_published?: boolean;
}
interface Response { data: Report[]; total: number }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const emptyDraft = {
	title: '', short_title: '', description: '', summary_points: '', drive_link: '', pdf_url: '',
	report_month: '', report_year: String(new Date().getFullYear()), show_on_dashboard: false, has_sections: true,
};

export default function ReportsAdminPage() {
	const { mutate } = useSWRConfig();
	const [draft, setDraft] = useState({ ...emptyDraft });
	const [createPending, setCreatePending] = useState(false);
	const [removePending, setRemovePending] = useState(false);
	const { data, error, isLoading } = useSWR<Response>(['/api/reports'], { dedupingInterval: 30_000 });

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/reports');

	const create = async () => {
		setCreatePending(true);
		try {
			// has_sections is a NEW column on reports — the legacy CRUD endpoint
			// doesn't know about it, so we POST to create + PATCH /flags to set it.
			const { has_sections, report_month, report_year, ...rest } = draft;
			const created = await api<{ id: string }>('POST', '/api/admin/reports', {
				title: rest.title,
				short_title: rest.short_title || undefined,
				description: rest.description || undefined,
				summary_points: rest.summary_points || undefined,
				drive_link: rest.drive_link || undefined,
				pdf_url: rest.pdf_url || undefined,
				report_month: report_month ? Number(report_month) : undefined,
				report_year: report_year ? Number(report_year) : undefined,
				show_on_dashboard: rest.show_on_dashboard,
			});
			if (has_sections) {
				await api('PATCH', `/api/admin/reports/${created.id}/flags`, { has_sections: true });
			}
			toast.success('Report created');
			setDraft({ ...emptyDraft });
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
			<PageHeader kicker={`Library · ${(data?.total ?? 0).toLocaleString()} reports`} title="Reports" />

			<div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
				<div style={{ fontWeight: 700, marginBottom: 12 }}>Publish a new report</div>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
					<input className="search-input" placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
					<input className="search-input" placeholder="Short title" value={draft.short_title} onChange={(e) => setDraft({ ...draft, short_title: e.target.value })} />
				</div>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 8 }}>
					<select className="search-input" value={draft.report_month} onChange={(e) => setDraft({ ...draft, report_month: e.target.value })}>
						<option value="">Month —</option>
						{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
					</select>
					<YearSelect value={draft.report_year} onChange={(v) => setDraft({ ...draft, report_year: v })} placeholder="Year —" />
					<label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
						<input type="checkbox" checked={draft.show_on_dashboard} onChange={(e) => setDraft({ ...draft, show_on_dashboard: e.target.checked })} />
						Feature on dashboard
					</label>
				</div>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
					<input className="search-input" placeholder="Drive link" value={draft.drive_link} onChange={(e) => setDraft({ ...draft, drive_link: e.target.value })} />
					<input className="search-input" placeholder="PDF URL" value={draft.pdf_url} onChange={(e) => setDraft({ ...draft, pdf_url: e.target.value })} />
				</div>
				<textarea
					className="search-input"
					placeholder="Description"
					value={draft.description}
					onChange={(e) => setDraft({ ...draft, description: e.target.value })}
					style={{ width: '100%', marginTop: 8, minHeight: 70, resize: 'vertical' }}
				/>
				<textarea
					className="search-input"
					placeholder="Summary points (one per line)"
					value={draft.summary_points}
					onChange={(e) => setDraft({ ...draft, summary_points: e.target.value })}
					style={{ width: '100%', marginTop: 8, minHeight: 60, resize: 'vertical' }}
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
				<AsyncState loading={isLoading} error={error} empty={reports.length === 0} emptyMsg="No reports yet." onRetry={() => void refresh()}>
				<table className="data-table">
					<thead><tr><th>Title</th><th>Model</th><th>Period</th><th>Status</th><th style={{ textAlign: 'right' }}></th></tr></thead>
					<tbody>
						{reports.map((r) => (
							<tr key={r.id}>
								<td>{r.title}{r.show_on_dashboard && <span className="tag" style={{ marginLeft: 6 }}>featured</span>}</td>
								<td>{r.has_sections ? <span className="tag pos">sections</span> : <span className="tag">pdf</span>}</td>
								<td className="num">{r.report_year ? `${r.report_month ? MONTHS[r.report_month - 1] + ' ' : ''}${r.report_year}` : '—'}</td>
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
				</AsyncState>
			</div>
		</div>
	);
}
