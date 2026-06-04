'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Trash2, Check, SkipForward, Upload } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/modal';
import { PageHeader, StatCard, AsyncState, Tag, Chip } from '@/components/atoms';

interface QueueRow {
	id: string; name: string; website: string | null; category: string | null; country: string | null;
	status: string; skip_reason: string | null; assigned_to: string | null; created_at: string;
}
interface QueueResponse { data: QueueRow[]; total: number }
interface Stats { counts: { pending: number; completed: number; skipped: number; total: number }; byAdmin: Array<{ assigned_to: string | null; full_name: string | null; pending: number; completed: number; skipped: number }> }
interface AdminUser { id: string; full_name?: string | null; display_name?: string | null; email: string; user_role: string }
interface UsersResponse { data: AdminUser[] }

const STATUSES = ['pending', 'completed', 'skipped'] as const;

export default function InvestorReviewPage() {
	const { mutate } = useSWRConfig();
	const [status, setStatus] = useState<string>('pending');
	const [assigned, setAssigned] = useState<string>('');
	const [search, setSearch] = useState('');
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [creating, setCreating] = useState(false);
	const [skipping, setSkipping] = useState<QueueRow | null>(null);
	const [bulkAssignee, setBulkAssignee] = useState('');

	const { data, error, isLoading } = useSWR<QueueResponse>(
		['/api/admin/investor-review', { status: status || undefined, assigned_to: assigned || undefined, q: search || undefined, limit: 50 }],
		{ dedupingInterval: 15_000 },
	);
	const { data: stats } = useSWR<Stats>(['/api/admin/investor-review/stats'], { dedupingInterval: 15_000 });
	const { data: usersResp } = useSWR<UsersResponse>(['/api/admin/users', { limit: 100 }], { dedupingInterval: 300_000 });
	const admins = (usersResp?.data ?? []).filter((u) => u.user_role === 'admin');
	const adminName = (id: string | null) => {
		if (!id) return '—';
		const u = admins.find((a) => a.id === id);
		return u ? (u.full_name || u.display_name || u.email) : `${id.slice(0, 8)}…`;
	};

	const refreshAll = () => {
		void mutate((key) => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/api/admin/investor-review'));
	};

	const rows = data?.data ?? [];
	const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
	const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
	const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

	const act = async (fn: () => Promise<unknown>, ok: string) => {
		try { await fn(); toast.success(ok); setSelected(new Set()); refreshAll(); }
		catch (e) { toast.error((e as Error).message); }
	};

	const bulkAssign = () => act(() => api('PATCH', '/api/admin/investor-review/bulk-assign', { ids: [...selected], assigned_to: bulkAssignee || null }), 'Assigned');
	const bulkComplete = () => act(() => api('PATCH', '/api/admin/investor-review/bulk-status', { ids: [...selected], status: 'completed' }), 'Marked completed');
	const addToDb = (id: string) => act(() => api('POST', `/api/admin/investor-review/${id}/add-to-database`), 'Promoted to investors');
	const remove = (id: string) => { if (confirm('Delete this candidate?')) void act(() => api('DELETE', `/api/admin/investor-review/${id}`), 'Deleted'); };

	return (
		<div>
			<PageHeader kicker="Curation · investor review" title="Investor review" subtitle="Triage candidate investors, assign reviewers, then promote into the catalog." />

			<div className="grid-4" style={{ marginBottom: 'var(--space-5)' }}>
				<StatCard label="Pending" value={(stats?.counts.pending ?? 0).toLocaleString()} urgent={(stats?.counts.pending ?? 0) > 0} />
				<StatCard label="Completed" value={(stats?.counts.completed ?? 0).toLocaleString()} />
				<StatCard label="Skipped" value={(stats?.counts.skipped ?? 0).toLocaleString()} />
				<StatCard label="Total" value={(stats?.counts.total ?? 0).toLocaleString()} />
			</div>

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)', gap: 8, flexWrap: 'wrap' }}>
				<Chip active={status === ''} onClick={() => setStatus('')}>All</Chip>
				{STATUSES.map((s) => <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{s}</Chip>)}
				<select className="search-input" style={{ height: 30, width: 200 }} value={assigned} onChange={(e) => setAssigned(e.target.value)}>
					<option value="">Any assignee</option>
					<option value="unassigned">Unassigned</option>
					{admins.map((a) => <option key={a.id} value={a.id}>{a.full_name || a.display_name || a.email}</option>)}
				</select>
				<input className="search-input" style={{ flex: '0 0 240px', height: 30 }} placeholder="Search name…" value={search} onChange={(e) => setSearch(e.target.value)} />
				<div style={{ flex: 1 }} />
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add candidate</button>
			</div>

			{selected.size > 0 && (
				<div className="card" style={{ padding: 12, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
					<strong>{selected.size} selected</strong>
					<select className="search-input" style={{ height: 30, width: 200 }} value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)}>
						<option value="">Unassign</option>
						{admins.map((a) => <option key={a.id} value={a.id}>{a.full_name || a.display_name || a.email}</option>)}
					</select>
					<button className="btn ghost" onClick={() => void bulkAssign()}>Assign</button>
					<button className="btn ghost" onClick={() => void bulkComplete()}><Check size={12} /> Mark completed</button>
				</div>
			)}

			{creating && <AddModal admins={admins} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refreshAll(); }} />}
			{skipping && <SkipModal row={skipping} onClose={() => setSkipping(null)} onSaved={() => { setSkipping(null); refreshAll(); }} />}

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={rows.length === 0} emptyMsg="No candidates in this view." onRetry={refreshAll}>
					<table className="data-table">
						<thead>
							<tr>
								<th style={{ width: 28 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
								<th>Name</th><th>Category</th><th>Country</th><th>Assigned</th><th>Status</th><th style={{ textAlign: 'right' }} />
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.id}>
									<td><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
									<td><div style={{ fontWeight: 600 }}>{r.name}</div>{r.website && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{r.website}</div>}</td>
									<td>{r.category ?? '—'}</td>
									<td>{r.country ?? '—'}</td>
									<td>{adminName(r.assigned_to)}</td>
									<td>
										<Tag variant={r.status === 'completed' ? 'pos' : r.status === 'skipped' ? 'warn' : ''}>{r.status}</Tag>
										{r.status === 'skipped' && r.skip_reason && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{r.skip_reason}</div>}
									</td>
									<td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
										{!r.status.includes('completed') && <button className="btn ghost" title="Promote to investors" onClick={() => void addToDb(r.id)}><Upload size={12} /></button>}
										<button className="btn ghost" title="Skip" onClick={() => setSkipping(r)}><SkipForward size={12} /></button>
										<button className="btn ghost" style={{ color: 'var(--accent)' }} title="Delete" onClick={() => remove(r.id)}><Trash2 size={12} /></button>
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

function AddModal({ admins, onClose, onSaved }: { admins: AdminUser[]; onClose: () => void; onSaved: () => void }) {
	const [name, setName] = useState('');
	const [website, setWebsite] = useState('');
	const [category, setCategory] = useState('');
	const [country, setCountry] = useState('');
	const [assignedTo, setAssignedTo] = useState('');
	const [pending, setPending] = useState(false);

	const submit = async () => {
		setPending(true);
		try {
			await api('POST', '/api/admin/investor-review', {
				name: name.trim(), website: website.trim() || undefined, category: category.trim() || undefined,
				country: country.trim() || undefined, assigned_to: assignedTo || undefined,
			});
			toast.success('Added'); onSaved();
		} catch (e) { toast.error((e as Error).message); } finally { setPending(false); }
	};

	return (
		<Modal title="Add candidate" onClose={onClose} width={480} footer={
			<>
				<button className="btn ghost" onClick={onClose}>Cancel</button>
				<button className="btn" disabled={!name.trim() || pending} onClick={() => void submit()}>{pending ? 'Saving…' : 'Add'}</button>
			</>
		}>
			<div style={{ display: 'grid', gap: 12 }}>
				<L label="Name"><input className="search-input" value={name} onChange={(e) => setName(e.target.value)} /></L>
				<L label="Website"><input className="search-input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" /></L>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
					<L label="Category"><input className="search-input" value={category} onChange={(e) => setCategory(e.target.value)} /></L>
					<L label="Country"><input className="search-input" value={country} onChange={(e) => setCountry(e.target.value)} /></L>
				</div>
				<L label="Assign to">
					<select className="search-input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
						<option value="">— unassigned —</option>
						{admins.map((a) => <option key={a.id} value={a.id}>{a.full_name || a.display_name || a.email}</option>)}
					</select>
				</L>
			</div>
		</Modal>
	);
}

function SkipModal({ row, onClose, onSaved }: { row: QueueRow; onClose: () => void; onSaved: () => void }) {
	const [reason, setReason] = useState(row.skip_reason ?? '');
	const [pending, setPending] = useState(false);
	const submit = async () => {
		setPending(true);
		try {
			await api('PATCH', `/api/admin/investor-review/${row.id}`, { status: 'skipped', skip_reason: reason.trim() || undefined });
			toast.success('Skipped'); onSaved();
		} catch (e) { toast.error((e as Error).message); } finally { setPending(false); }
	};
	return (
		<Modal title={`Skip ${row.name}`} onClose={onClose} width={420} footer={
			<>
				<button className="btn ghost" onClick={onClose}>Cancel</button>
				<button className="btn" disabled={pending} onClick={() => void submit()}>{pending ? 'Saving…' : 'Skip'}</button>
			</>
		}>
			<L label="Reason (optional)"><textarea className="search-input" style={{ minHeight: 70, resize: 'vertical' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this candidate being skipped?" /></L>
		</Modal>
	);
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
	return <div><div className="co-stat-label" style={{ marginBottom: 6 }}>{label}</div>{children}</div>;
}
