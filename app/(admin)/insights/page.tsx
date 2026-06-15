'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Plus, Save, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/confirm';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState } from '@/components/atoms';

interface Insight {
	id: string;
	content: string;
	redirect_route: string | null;
	sequence_number: number;
	is_active: boolean;
}

/**
 * Insights admin — curate the short, daily-rotating cards shown on the client
 * dashboard. Order controls the rotation (the public feed advances by day),
 * inactive cards are hidden from the feed.
 */
export default function InsightsAdminPage() {
	const ask = useConfirm();
	const { data, error, isLoading, mutate } = useSWR<Insight[]>(['/api/admin/insights'], { dedupingInterval: 30_000 });
	const [editing, setEditing] = useState<Insight | null>(null);
	const [creating, setCreating] = useState(false);

	const rows = data ?? [];
	const refresh = () => void mutate();

	const move = async (id: string, dir: 'up' | 'down') => {
		try { await api('POST', `/api/admin/insights/${id}/move`, { dir }); refresh(); }
		catch (e) { toast.error((e as Error).message); }
	};
	const toggle = async (i: Insight) => {
		try { await api('PATCH', `/api/admin/insights/${i.id}`, { is_active: !i.is_active }); refresh(); }
		catch (e) { toast.error((e as Error).message); }
	};
	const remove = async (i: Insight) => {
		if (!(await ask('Delete this insight?'))) return;
		try { await api('DELETE', `/api/admin/insights/${i.id}`); toast.success('Deleted'); refresh(); }
		catch (e) { toast.error((e as Error).message); }
	};

	return (
		<div>
			<PageHeader kicker={`Content · ${rows.length} insight${rows.length === 1 ? '' : 's'}`} title="Insights" subtitle="Daily-rotating cards on the client dashboard. Order sets the rotation; inactive cards are hidden." />

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)', display: 'flex', justifyContent: 'flex-end' }}>
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add insight</button>
			</div>

			{(creating || editing) && (
				<InsightModal
					insight={editing}
					onClose={() => { setCreating(false); setEditing(null); }}
					onSaved={() => { setCreating(false); setEditing(null); refresh(); }}
				/>
			)}

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={rows.length === 0} emptyMsg="No insights yet. Add one to start the rotation." onRetry={refresh}>
					<table className="data-table">
						<thead><tr><th style={{ width: 70 }}>Order</th><th>Content</th><th>Redirect</th><th>Active</th><th style={{ textAlign: 'right' }} /></tr></thead>
						<tbody>
							{rows.map((i, idx) => (
								<tr key={i.id} style={i.is_active ? undefined : { opacity: 0.5 }}>
									<td style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
										<button className="btn ghost" disabled={idx === 0} onClick={() => void move(i.id, 'up')} title="Move up"><ArrowUp size={12} /></button>
										<button className="btn ghost" disabled={idx === rows.length - 1} onClick={() => void move(i.id, 'down')} title="Move down"><ArrowDown size={12} /></button>
									</td>
									<td style={{ maxWidth: 460, whiteSpace: 'normal' }}>{i.content}</td>
									<td className="num" style={{ fontSize: 11 }}>{i.redirect_route ?? '—'}</td>
									<td>
										<label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
											<input type="checkbox" checked={i.is_active} onChange={() => void toggle(i)} /> {i.is_active ? 'Active' : 'Hidden'}
										</label>
									</td>
									<td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
										<button className="btn ghost" onClick={() => setEditing(i)}>Edit</button>
										<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void remove(i)}><Trash2 size={12} /></button>
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

function InsightModal({ insight, onClose, onSaved }: { insight: Insight | null; onClose: () => void; onSaved: () => void }) {
	const isEdit = !!insight;
	const [content, setContent] = useState(insight?.content ?? '');
	const [redirect, setRedirect] = useState(insight?.redirect_route ?? '');
	const [active, setActive] = useState(insight?.is_active ?? true);
	const [pending, setPending] = useState(false);

	const submit = async () => {
		if (!content.trim()) { toast.error('Content is required'); return; }
		setPending(true);
		try {
			const body = { content: content.trim(), redirect_route: redirect.trim() || null, is_active: active };
			if (isEdit) await api('PATCH', `/api/admin/insights/${insight!.id}`, body);
			else await api('POST', '/api/admin/insights', body);
			toast.success(isEdit ? 'Saved' : 'Created');
			onSaved();
		} catch (e) { toast.error((e as Error).message); } finally { setPending(false); }
	};

	return (
		<Modal title={isEdit ? 'Edit insight' : 'New insight'} onClose={onClose} width={560} footer={
			<>
				<button className="btn ghost" onClick={onClose}>Cancel</button>
				<button className="btn" disabled={pending || !content.trim()} onClick={() => void submit()}><Save size={12} /> {pending ? 'Saving…' : 'Save'}</button>
			</>
		}>
			<div style={{ display: 'grid', gap: 12 }}>
				<div>
					<div className="co-stat-label" style={{ marginBottom: 6 }}>Content</div>
					<textarea className="search-input" style={{ minHeight: 100, resize: 'vertical' }} value={content} onChange={(e) => setContent(e.target.value)} placeholder="A short, punchy insight shown on the dashboard…" />
				</div>
				<div>
					<div className="co-stat-label" style={{ marginBottom: 6 }}>Redirect route <span style={{ color: 'var(--fg-muted)', textTransform: 'none', letterSpacing: 0 }}>· where the card links (optional)</span></div>
					<input className="search-input" value={redirect} onChange={(e) => setRedirect(e.target.value)} placeholder="/reports/gst-vc-2026" />
				</div>
				<label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
					<input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active (shown in the rotation)
				</label>
			</div>
		</Modal>
	);
}
