'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Trash2, Check, SkipForward, Rocket, Undo2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/confirm';
import { Modal } from '@/components/modal';
import { PageHeader, StatCard, AsyncState, Tag, Chip, Section } from '@/components/atoms';
import { Funnel } from '@/components/charts';
import { WorkSessionTimer, countWorkItem } from '@/components/work-session-timer';
import { InvestorModal } from '../investors/page';

interface QueueRow {
	id: string; name: string; website: string | null; category: string | null; country: string | null;
	status: string; skip_reason: string | null; assigned_to: string | null; created_at: string;
}
interface QueueResponse { data: QueueRow[]; total: number }
interface PerAdmin { assigned_to: string | null; full_name: string | null; pending: number; completed: number; skipped: number; completion_rate: number }
interface Stats {
	counts: { pending: number; completed: number; skipped: number; total: number };
	byAdmin: PerAdmin[];
	weekly?: { completed_this_week: number; completed_last_week: number; carried: number };
}
interface TimeStats { perAdmin: Array<{ admin_id: string; full_name: string | null; total_seconds: number; items: number; avg_seconds_per_item: number }>; totals: { total_seconds: number; items: number } }
interface AdminUser { id: string; full_name?: string | null; display_name?: string | null; email: string; user_role: string }
interface UsersResponse { data: AdminUser[] }
interface DedupeMatch { id: string; name: string; website: string | null; slug: string | null }
interface Preview { matches: DedupeMatch[]; prefill: { name: string; website: string; category: string; hq_country: string } }

const fmtTime = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };

const STATUSES = ['pending', 'completed', 'skipped'] as const;

export default function InvestorReviewPage() {
	const { mutate } = useSWRConfig();
	const ask = useConfirm();
	const [status, setStatus] = useState<string>('pending');
	const [assigned, setAssigned] = useState<string>('');
	const [search, setSearch] = useState('');
	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [creating, setCreating] = useState(false);
	const [importing, setImporting] = useState(false);
	const [promoting, setPromoting] = useState<QueueRow | null>(null);
	const [skipping, setSkipping] = useState<QueueRow | null>(null);
	const [bulkAssignee, setBulkAssignee] = useState('');

	const { data, error, isLoading } = useSWR<QueueResponse>(
		['/api/admin/investor-review', { status: status || undefined, assigned_to: assigned || undefined, q: search || undefined, from: from || undefined, to: to || undefined, limit: 50 }],
		{ dedupingInterval: 15_000 },
	);
	const { data: stats } = useSWR<Stats>(['/api/admin/investor-review/stats'], { dedupingInterval: 15_000 });
	const { data: timeStats } = useSWR<TimeStats>(['/api/admin/work-sessions/stats', { queue: 'investor_review' }], { dedupingInterval: 30_000 });
	const { data: usersResp } = useSWR<UsersResponse>(['/api/admin/users', { limit: 100 }], { dedupingInterval: 300_000 });
	const admins = (usersResp?.data ?? []).filter((u) => u.user_role === 'admin');
	const timeFor = (id: string | null) => timeStats?.perAdmin.find((t) => t.admin_id === id);
	const adminName = (id: string | null) => {
		if (!id) return '—';
		const u = admins.find((a) => a.id === id);
		return u ? (u.full_name || u.display_name || u.email) : `${id.slice(0, 8)}…`;
	};

	const refreshAll = () => {
		void mutate((key) => Array.isArray(key) && typeof key[0] === 'string' && (key[0].startsWith('/api/admin/investor-review') || key[0].startsWith('/api/admin/work-sessions')));
	};

	const rows = data?.data ?? [];
	const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
	const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
	const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

	const act = async (fn: () => Promise<unknown>, ok: string) => {
		try { await fn(); toast.success(ok); setSelected(new Set()); refreshAll(); }
		catch (e) { toast.error((e as Error).message); }
	};

	const bulkAssign = (roundRobin: boolean) => act(
		() => api('PATCH', '/api/admin/investor-review/bulk-assign', roundRobin
			? { ids: [...selected], assigned_to_list: admins.map((a) => a.id) }
			: { ids: [...selected], assigned_to: bulkAssignee || null }),
		roundRobin ? 'Distributed round-robin' : 'Assigned',
	);
	const bulkComplete = () => act(() => api('PATCH', '/api/admin/investor-review/bulk-status', { ids: [...selected], status: 'completed' }), 'Marked completed');
	const bulkSkip = () => act(() => api('PATCH', '/api/admin/investor-review/bulk-status', { ids: [...selected], status: 'skipped' }), 'Marked skipped');
	const bulkDelete = async () => { if (await ask(`Delete ${selected.size} candidate(s)? This cannot be undone.`)) void act(() => api('DELETE', '/api/admin/investor-review/bulk', { ids: [...selected] }), 'Deleted'); };
	const selectAllMatching = async () => {
		const p = new URLSearchParams();
		if (status) p.set('status', status);
		if (assigned) p.set('assigned_to', assigned);
		if (search) p.set('q', search);
		if (from) p.set('from', from);
		if (to) p.set('to', to);
		try { const r = await api<{ ids: string[] }>('GET', `/api/admin/investor-review/ids?${p.toString()}`); setSelected(new Set(r.ids)); }
		catch (e) { toast.error((e as Error).message); }
	};
	const remove = (id: string) => { void (async () => { if (await ask('Delete this candidate?')) void act(() => api('DELETE', `/api/admin/investor-review/${id}`), 'Deleted'); })(); };
	const unskip = (id: string) => act(() => api('PATCH', `/api/admin/investor-review/${id}`, { status: 'pending', skip_reason: '' }), 'Moved back to pending');

	return (
		<div>
			<PageHeader kicker="Curation · investor review" title="Investor review" subtitle="Triage candidate investors, assign reviewers, then promote into the catalog." />

			<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-3)' }}>
				<WorkSessionTimer queue="investor_review" />
			</div>

			<div className="grid-4" style={{ marginBottom: 'var(--space-5)' }}>
				<StatCard label="Pending" value={(stats?.counts.pending ?? 0).toLocaleString()} urgent={(stats?.counts.pending ?? 0) > 0} />
				<StatCard label="Completed" value={(stats?.counts.completed ?? 0).toLocaleString()} delta={stats?.weekly && stats.weekly.completed_last_week > 0 ? ((stats.weekly.completed_this_week - stats.weekly.completed_last_week) / stats.weekly.completed_last_week) * 100 : null} />
				<StatCard label="Skipped" value={(stats?.counts.skipped ?? 0).toLocaleString()} />
				<StatCard label="Total" value={(stats?.counts.total ?? 0).toLocaleString()} />
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<Section title="Review funnel" meta="pending → completed">
					<Funnel stages={[
						{ label: 'Pending', value: stats?.counts.pending ?? 0 },
						{ label: 'Completed', value: stats?.counts.completed ?? 0, color: 'var(--pos)' },
						{ label: 'Skipped', value: stats?.counts.skipped ?? 0, color: 'var(--warn)' },
					]} />
				</Section>
				<Section title="Reviewer productivity" meta="pending · completed · time">
					{(stats?.byAdmin ?? []).filter((a) => a.assigned_to).length === 0
						? <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>No assigned reviewers yet.</div>
						: (
							<table className="data-table">
								<thead><tr><th>Reviewer</th><th>Pending</th><th>Completed</th><th>Done %</th><th>Time</th></tr></thead>
								<tbody>
									{(stats?.byAdmin ?? []).filter((a) => a.assigned_to).map((a) => {
										const t = timeFor(a.assigned_to);
										return (
											<tr key={a.assigned_to}>
												<td>{a.full_name ?? `${a.assigned_to!.slice(0, 8)}…`}</td>
												<td className="num">{a.pending}</td>
												<td className="num">{a.completed}</td>
												<td className="num">
													{a.completion_rate}%
													<div style={{ height: 4, background: 'var(--bg-2)', borderRadius: 2, marginTop: 3, overflow: 'hidden' }}>
														<div style={{ height: '100%', width: `${a.completion_rate}%`, background: 'var(--pos)' }} />
													</div>
												</td>
												<td className="num">{t ? fmtTime(t.total_seconds) : '—'}</td>
											</tr>
										);
									})}
								</tbody>
							</table>
						)}
				</Section>
			</div>

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)', gap: 8, flexWrap: 'wrap' }}>
				<Chip active={status === ''} onClick={() => setStatus('')}>All</Chip>
				{STATUSES.map((s) => <Chip key={s} active={status === s} onClick={() => setStatus(s)}>{s}</Chip>)}
				<select className="search-input" style={{ height: 30, width: 200 }} value={assigned} onChange={(e) => setAssigned(e.target.value)}>
					<option value="">Any assignee</option>
					<option value="unassigned">Unassigned</option>
					{admins.map((a) => <option key={a.id} value={a.id}>{a.full_name || a.display_name || a.email}</option>)}
				</select>
				<input className="search-input" style={{ flex: '0 0 200px', height: 30 }} placeholder="Search name…" value={search} onChange={(e) => setSearch(e.target.value)} />
				<input className="search-input" type="date" style={{ height: 30 }} value={from} onChange={(e) => setFrom(e.target.value)} title="Added from" />
				<input className="search-input" type="date" style={{ height: 30 }} value={to} onChange={(e) => setTo(e.target.value)} title="Added to" />
				<div style={{ flex: 1 }} />
				<button className="btn ghost" onClick={() => setImporting(true)}><Plus size={12} /> Import</button>
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add candidate</button>
			</div>

			{selected.size > 0 && (
				<div className="card" style={{ padding: 12, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
					<strong>{selected.size} selected</strong>
					{(data?.total ?? 0) > selected.size && (
						<button className="btn ghost" onClick={() => void selectAllMatching()}>Select all {(data?.total ?? 0).toLocaleString()} matching</button>
					)}
					<select className="search-input" style={{ height: 30, width: 200 }} value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)}>
						<option value="">Unassign</option>
						{admins.map((a) => <option key={a.id} value={a.id}>{a.full_name || a.display_name || a.email}</option>)}
					</select>
					<button className="btn ghost" onClick={() => void bulkAssign(false)}>Assign</button>
					<button className="btn ghost" disabled={admins.length === 0} onClick={() => void bulkAssign(true)} title="Distribute evenly across admins">Round-robin</button>
					<button className="btn ghost" onClick={() => void bulkComplete()}><Check size={12} /> Completed</button>
					<button className="btn ghost" onClick={() => void bulkSkip()}><SkipForward size={12} /> Skip</button>
					<div style={{ flex: 1 }} />
					<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void bulkDelete()}><Trash2 size={12} /> Delete</button>
				</div>
			)}

			{creating && <AddModal admins={admins} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refreshAll(); }} />}
			{importing && <ImportModal onClose={() => setImporting(false)} onSaved={() => { setImporting(false); refreshAll(); }} />}
			{promoting && <PromoteModal row={promoting} onClose={() => setPromoting(null)} onDone={() => { setPromoting(null); refreshAll(); }} />}
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
										{r.status !== 'completed' && <button className="btn" title="Promote to investors" onClick={() => setPromoting(r)}><Rocket size={12} /> Promote</button>}
										{r.status === 'skipped'
											? <button className="btn ghost" title="Move back to pending" onClick={() => void unskip(r.id)}><Undo2 size={12} /> Unskip</button>
											: <button className="btn ghost" title="Skip" onClick={() => setSkipping(r)}><SkipForward size={12} /></button>}
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
			<L label="Reason">
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
					{SKIP_PRESETS.map((p) => <button key={p} type="button" className={`chip ${reason === p ? 'on' : ''}`} onClick={() => setReason(p)}>{p}</button>)}
				</div>
				<textarea className="search-input" style={{ minHeight: 60, resize: 'vertical' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Pick a preset above or type a reason…" />
			</L>
		</Modal>
	);
}
const SKIP_PRESETS = ['Individual', 'Sports Organisation', 'Asset Manager', 'Not an investor', 'Other'];

// Valid investor category enum labels — used to map a free-text queue category
// onto the investor form's select (left blank if it doesn't match).
const INVESTOR_CATEGORIES = ['venture_capital', 'private_equity', 'financial_services', 'family_investment_office', 'sovereign_wealth_fund', 'angel', 'other'];

function PromoteModal({ row, onClose, onDone }: { row: QueueRow; onClose: () => void; onDone: () => void }) {
	const { data: preview, isLoading } = useSWR<Preview>([`/api/admin/investor-review/${row.id}/promote-preview`], { revalidateOnFocus: false });
	const [createOpen, setCreateOpen] = useState(false);
	const [busy, setBusy] = useState(false);

	const merge = async (investorId: string) => {
		setBusy(true);
		try { await api('POST', `/api/admin/investor-review/${row.id}/merge`, { investor_id: investorId }); countWorkItem('investor_review'); toast.success('Merged into existing investor'); onDone(); }
		catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
	};
	const onCreated = (createdId?: string) => {
		// The investor create links + marks the review row in its own transaction
		// (via promoteReviewId), so there's no separate mark-promoted call here.
		if (!createdId) { setCreateOpen(false); return; }
		countWorkItem('investor_review');
		onDone();
	};

	if (createOpen) {
		const p = preview?.prefill;
		const cat = p && INVESTOR_CATEGORIES.includes(p.category) ? p.category : '';
		return (
			<InvestorModal
				id={null}
				seed={p ? { name: p.name, website: p.website, category: cat, hq: { country: p.hq_country, city: '', continent: '', region: '', state: '' } } : undefined}
				promoteReviewId={row.id}
				onClose={() => setCreateOpen(false)}
				onSaved={(id) => onCreated(id)}
			/>
		);
	}
	return (
		<Modal title={`Promote ${row.name}`} onClose={onClose} width={520} footer={
			<>
				<button className="btn ghost" onClick={onClose}>Cancel</button>
				<button className="btn" disabled={busy} onClick={() => setCreateOpen(true)}>Create new investor →</button>
			</>
		}>
			{isLoading ? <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>Checking for duplicates…</div> : (
				(preview?.matches.length ?? 0) > 0 ? (
					<div>
						<div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Possible existing matches — merge to avoid a duplicate:</div>
						<div style={{ display: 'grid', gap: 6 }}>
							{preview!.matches.map((m) => (
								<div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, border: '1px solid var(--border)', borderRadius: 8 }}>
									<div style={{ flex: 1 }}>
										<div style={{ fontWeight: 600 }}>{m.name}</div>
										{m.website && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{m.website}</div>}
									</div>
									<button className="btn ghost" disabled={busy} onClick={() => void merge(m.id)}>Merge</button>
								</div>
							))}
						</div>
					</div>
				) : <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>No likely duplicates found. Create a new investor with the candidate&apos;s details.</div>
			)}
		</Modal>
	);
}

function ImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
	const [text, setText] = useState('');
	const [pending, setPending] = useState(false);
	const parse = () => text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
		const [a, b] = line.split(/[,\t]/).map((s) => s.trim());
		if (b) return { name: a, website: b };
		if (/^https?:\/\//i.test(a)) return { name: a.replace(/^https?:\/\//, '').replace(/\/.*$/, ''), website: a };
		return { name: a };
	});
	const submit = async () => {
		const rows = parse();
		if (!rows.length) { toast.error('Paste at least one line'); return; }
		setPending(true);
		try {
			const r = await api<{ inserted: number; skipped: number }>('POST', '/api/admin/investor-review/import', { rows });
			toast.success(`Imported ${r.inserted}${r.skipped ? `, skipped ${r.skipped} dup(s)` : ''}`); onSaved();
		} catch (e) { toast.error((e as Error).message); } finally { setPending(false); }
	};
	return (
		<Modal title="Bulk import candidates" onClose={onClose} width={520} footer={
			<>
				<button className="btn ghost" onClick={onClose}>Cancel</button>
				<button className="btn" disabled={!text.trim() || pending} onClick={() => void submit()}>{pending ? 'Importing…' : 'Import'}</button>
			</>
		}>
			<div style={{ display: 'grid', gap: 8 }}>
				<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>One per line. Use <code>Name, https://website</code> or paste plain URLs. Duplicates (by website) are skipped.</div>
				<textarea className="search-input" style={{ minHeight: 180, resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Sequoia Capital, https://sequoiacap.com\nhttps://a16z.com'} />
			</div>
		</Modal>
	);
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
	return <div><div className="co-stat-label" style={{ marginBottom: 6 }}>{label}</div>{children}</div>;
}
