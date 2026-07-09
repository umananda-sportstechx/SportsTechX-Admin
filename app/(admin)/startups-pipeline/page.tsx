'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Check, X, Trash2, Upload, Rocket } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useConfirm } from '@/components/confirm';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState, StatCard, Section, Tag } from '@/components/atoms';
import { Funnel } from '@/components/charts';
import { StatStrip } from '@/components/filters';
import { WorkSessionTimer, countWorkItem } from '@/components/work-session-timer';
import { CandidateInput, parseCandidates } from '@/components/candidate-import';
import { EMPTY_LOCATION } from '@/components/entity-pickers';
import { CompanyModal } from '../companies/page';

type Status = 'new' | 'reviewing' | 'added' | 'rejected';
interface PerAdmin { assigned_to: string | null; full_name: string | null; pending: number; added: number; rejected: number; completion_rate: number }
interface Stats {
	counts: { new: number; reviewing: number; added: number; rejected: number; total: number };
	byAdmin: PerAdmin[];
	weekly: { added_this_week: number; added_last_week: number; carried: number; carried_last_week: number; avg_per_day: number; avg_per_day_last_week: number };
}
interface TimeStats { perAdmin: Array<{ admin_id: string; full_name: string | null; total_seconds: number; items: number; avg_seconds_per_item: number }>; totals: { total_seconds: number; items: number } }
interface AdminUser { id: string; full_name?: string | null; display_name?: string | null; email: string; user_role: string }
interface UsersResponse { data: AdminUser[] }

interface Entry {
	id: string; name: string; website: string | null; source: string | null; notes: string | null;
	status: Status; hq_country: string | null; hq_city: string | null;
	assigned_to: string | null; company_id: string | null; created_at: string;
}
interface Response { data: Entry[]; total: number }
interface DedupeMatch { id: string; name: string; website: string | null; slug: string | null; status: string | null }
interface Preview { matches: DedupeMatch[]; prefill: { name: string; website: string; description: string; hq_country: string; hq_city: string } }

const TABS: Array<{ label: string; key: Status | '' }> = [
	{ label: 'All', key: '' }, { label: 'New', key: 'new' }, { label: 'Reviewing', key: 'reviewing' },
	{ label: 'Added', key: 'added' }, { label: 'Rejected', key: 'rejected' },
];
const fmtTime = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${m}m` : `${m}m`; };
/** Decimal duration like the old admin: "12.96h" / "2.97 min" / "45s". */
const fmtDur = (s: number): string => (s >= 3600 ? `${(s / 3600).toFixed(2)}h` : s >= 60 ? `${(s / 60).toFixed(2)} min` : `${Math.round(s)}s`);
void fmtTime;

export default function StartupsPipelinePage() {
	const { mutate } = useSWRConfig();
	const ask = useConfirm();
	const [status, setStatus] = useState<Status | ''>('new');
	const [assigned, setAssigned] = useState('');
	const [search, setSearch] = useState('');
	const debouncedSearch = useDebouncedValue(search);
	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [bulkAssignee, setBulkAssignee] = useState('');
	const [creating, setCreating] = useState(false);
	const [importing, setImporting] = useState(false);
	const [promoting, setPromoting] = useState<Entry | null>(null);

	const { data, error, isLoading } = useSWR<Response>(
		['/api/admin/startups-pipeline', { status: status || undefined, assigned_to: assigned || undefined, q: debouncedSearch || undefined, from: from || undefined, to: to || undefined, limit: 50 }],
		{ dedupingInterval: 15_000 },
	);
	const { data: stats } = useSWR<Stats>(['/api/admin/startups-pipeline/stats'], { dedupingInterval: 30_000 });
	const { data: timeStats } = useSWR<TimeStats>(['/api/admin/work-sessions/stats', { queue: 'startups_pipeline' }], { dedupingInterval: 30_000 });
	const { data: usersResp } = useSWR<UsersResponse>(['/api/admin/users', { limit: 100 }], { dedupingInterval: 300_000 });
	const admins = (usersResp?.data ?? []).filter((u) => u.user_role === 'admin');
	const adminName = (id: string | null) => { if (!id) return '—'; const u = admins.find((a) => a.id === id); return u ? (u.full_name || u.display_name || u.email) : `${id.slice(0, 8)}…`; };
	const timeFor = (id: string | null) => timeStats?.perAdmin.find((t) => t.admin_id === id);

	const refreshAll = () => void mutate((key) => Array.isArray(key) && typeof key[0] === 'string' && (key[0].startsWith('/api/admin/startups-pipeline') || key[0].startsWith('/api/admin/work-sessions')));

	const c = stats?.counts;
	const pending = (c?.new ?? 0) + (c?.reviewing ?? 0);
	const weekDelta = stats?.weekly && stats.weekly.added_last_week > 0 ? ((stats.weekly.added_this_week - stats.weekly.added_last_week) / stats.weekly.added_last_week) * 100 : null;
	const reviewers = (stats?.byAdmin ?? []).filter((a) => a.assigned_to);
	const entries = data?.data ?? [];
	const allSelected = entries.length > 0 && entries.every((r) => selected.has(r.id));
	const toggleAll = () => setSelected(allSelected ? new Set() : new Set(entries.map((r) => r.id)));
	const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

	const act = async (fn: () => Promise<unknown>, ok: string) => {
		try { await fn(); toast.success(ok); setSelected(new Set()); refreshAll(); }
		catch (e) { toast.error((e as Error).message); }
	};
	const update = (id: string, next: Status) => act(() => api('PATCH', `/api/admin/startups-pipeline/${id}`, { status: next }), 'Updated');
	const remove = (id: string, name: string) => { void (async () => { if (await ask(`Delete ${name} from the pipeline?`)) void act(() => api('DELETE', `/api/admin/startups-pipeline/${id}`), 'Deleted'); })(); };
	const selectAllMatching = async () => {
		const p = new URLSearchParams();
		if (status) p.set('status', status);
		if (assigned) p.set('assigned_to', assigned);
		if (search) p.set('q', search);
		if (from) p.set('from', from);
		if (to) p.set('to', to);
		try { const r = await api<{ ids: string[] }>('GET', `/api/admin/startups-pipeline/ids?${p.toString()}`); setSelected(new Set(r.ids)); }
		catch (e) { toast.error((e as Error).message); }
	};
	const bulkAssign = (roundRobin: boolean) => act(
		() => api('PATCH', '/api/admin/startups-pipeline/bulk-assign', roundRobin
			? { ids: [...selected], assigned_to_list: admins.map((a) => a.id) }
			: { ids: [...selected], assigned_to: bulkAssignee || null }),
		roundRobin ? 'Distributed round-robin' : 'Assigned',
	);
	const bulkStatus = (s: Status) => act(() => api('PATCH', '/api/admin/startups-pipeline/bulk-status', { ids: [...selected], status: s }), 'Updated');
	const bulkDelete = () => { void (async () => { if (await ask(`Delete ${selected.size} entr(ies)?`)) void act(() => api('DELETE', '/api/admin/startups-pipeline/bulk', { ids: [...selected] }), 'Deleted'); })(); };

	return (
		<div>
			<PageHeader kicker="Pipeline · startups to add" title="Startups to add" subtitle="Triage submissions, assign reviewers, then promote into the companies catalog." />

			<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-3)' }}>
				<WorkSessionTimer queue="startups_pipeline" />
			</div>

			<StatStrip cols={4}>
				<StatCard label="Total in Sheet" tone="blue" value={(c?.total ?? 0).toLocaleString()} />
				<StatCard label="Added" tone="green" value={(c?.added ?? 0).toLocaleString()} />
				<StatCard label="Pending" tone="amber" value={pending.toLocaleString()} urgent={pending > 0} />
				<StatCard label="Added this week" tone="purple" value={(stats?.weekly.added_this_week ?? 0).toLocaleString()} delta={weekDelta} />
			</StatStrip>

			{/* Per-admin completion + time, week-over-week throughput, and the funnel — matches the old admin panel. */}
			<CompletionByAdmin rows={reviewers} adminName={adminName} />

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<TimeAnalytics timeStats={timeStats} adminName={adminName} />
				<WeeklyMetrics weekly={stats?.weekly} />
			</div>

			<Section title="Pipeline funnel" meta="new → added">
				<Funnel stages={[
					{ label: 'New', value: c?.new ?? 0 },
					{ label: 'Reviewing', value: c?.reviewing ?? 0 },
					{ label: 'Added', value: c?.added ?? 0, color: 'var(--pos)' },
					{ label: 'Rejected', value: c?.rejected ?? 0, color: 'var(--neg)' },
				]} />
			</Section>
			<div style={{ marginBottom: 'var(--space-5)' }} />

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)', gap: 8, flexWrap: 'wrap' }}>
				{TABS.map((t) => <button key={t.key} className={`chip ${status === t.key ? 'on' : ''}`} onClick={() => setStatus(t.key)}>{t.label}</button>)}
				<select className="search-input" style={{ height: 30, width: 190 }} value={assigned} onChange={(e) => setAssigned(e.target.value)}>
					<option value="">Any assignee</option>
					<option value="unassigned">Unassigned</option>
					{admins.map((a) => <option key={a.id} value={a.id}>{a.full_name || a.display_name || a.email}</option>)}
				</select>
				<input className="search-input" style={{ flex: '0 0 200px', height: 30 }} placeholder="Search name / site…" value={search} onChange={(e) => setSearch(e.target.value)} />
				<input className="search-input" type="date" style={{ height: 30 }} value={from} onChange={(e) => setFrom(e.target.value)} title="Added from" />
				<input className="search-input" type="date" style={{ height: 30 }} value={to} onChange={(e) => setTo(e.target.value)} title="Added to" />
				<div style={{ flex: 1 }} />
				<button className="btn ghost" onClick={() => setImporting(true)}><Upload size={12} /> Import</button>
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add candidate</button>
			</div>

			{selected.size > 0 && (
				<div className="card" style={{ padding: 12, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
					<strong>{selected.size} selected</strong>
					{(data?.total ?? 0) > selected.size && <button className="btn ghost" onClick={() => void selectAllMatching()}>Select all {(data?.total ?? 0).toLocaleString()} matching</button>}
					<select className="search-input" style={{ height: 30, width: 180 }} value={bulkAssignee} onChange={(e) => setBulkAssignee(e.target.value)}>
						<option value="">Unassign</option>
						{admins.map((a) => <option key={a.id} value={a.id}>{a.full_name || a.display_name || a.email}</option>)}
					</select>
					<button className="btn ghost" onClick={() => void bulkAssign(false)}>Assign</button>
					<button className="btn ghost" disabled={admins.length === 0} onClick={() => void bulkAssign(true)} title="Distribute evenly across admins">Round-robin</button>
					<button className="btn ghost" onClick={() => void bulkStatus('added')}><Check size={12} /> Added</button>
					<button className="btn ghost" onClick={() => void bulkStatus('rejected')}><X size={12} /> Reject</button>
					<div style={{ flex: 1 }} />
					<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void bulkDelete()}><Trash2 size={12} /> Delete</button>
				</div>
			)}

			{creating && <AddModal admins={admins} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); refreshAll(); }} />}
			{importing && <ImportModal onClose={() => setImporting(false)} onSaved={() => { setImporting(false); refreshAll(); }} />}
			{promoting && <PromoteModal row={promoting} onClose={() => setPromoting(null)} onDone={() => { setPromoting(null); refreshAll(); }} />}

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={entries.length === 0} emptyMsg={`Nothing in ${status || 'any status'}.`} onRetry={refreshAll}>
					<table className="data-table">
						<thead>
							<tr>
								<th style={{ width: 28 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
								<th>Date</th><th>Name</th><th>HQ</th><th>Source</th><th>Notes</th><th>Assigned</th><th>Status</th><th style={{ textAlign: 'right' }}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{entries.map((e) => (
								<tr key={e.id}>
									<td><input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} /></td>
									<td className="num">{new Date(e.created_at).toLocaleDateString()}</td>
									<td><div style={{ fontWeight: 600 }}>{e.name}</div>{e.website && <a href={e.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--accent)' }}>{e.website}</a>}</td>
									<td>{[e.hq_city, e.hq_country].filter(Boolean).join(', ') || '—'}</td>
									<td style={{ fontSize: 12 }}>{e.source ?? '—'}</td>
									<td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--fg-muted)' }} title={e.notes ?? ''}>{e.notes ?? '—'}</td>
									<td>{adminName(e.assigned_to)}</td>
									<td><Tag variant={e.status === 'added' ? 'pos' : e.status === 'rejected' ? 'warn' : ''}>{e.status}</Tag></td>
									<td style={{ textAlign: 'right' }}>
										<div style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
											{e.status !== 'added' && <button className="btn" title="Promote to companies" onClick={() => setPromoting(e)}><Rocket size={12} /> Promote</button>}
											{e.status === 'new' && <button className="btn ghost" onClick={() => void update(e.id, 'reviewing')}>Review</button>}
											{e.status !== 'rejected' && e.status !== 'added' && <button className="btn ghost" title="Reject" onClick={() => void update(e.id, 'rejected')}><X size={12} /></button>}
											<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => remove(e.id, e.name)}><Trash2 size={12} /></button>
										</div>
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

function PromoteModal({ row, onClose, onDone }: { row: Entry; onClose: () => void; onDone: () => void }) {
	const { data: preview, isLoading } = useSWR<Preview>([`/api/admin/startups-pipeline/${row.id}/promote-preview`], { revalidateOnFocus: false });
	const [createOpen, setCreateOpen] = useState(false);
	const [busy, setBusy] = useState(false);

	const merge = async (companyId: string) => {
		setBusy(true);
		try { await api('POST', `/api/admin/startups-pipeline/${row.id}/merge`, { company_id: companyId }); countWorkItem('startups_pipeline'); toast.success('Merged into existing company'); onDone(); }
		catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
	};
	const onCreated = (createdId?: string) => {
		// The company create links + marks the pipeline row in its own transaction
		// (via promotePipelineId), so there's no separate mark-promoted call here.
		if (!createdId) { setCreateOpen(false); return; }
		countWorkItem('startups_pipeline');
		onDone();
	};

	if (createOpen) {
		const p = preview?.prefill;
		return (
			<CompanyModal
				id={null}
				seed={p ? { name: p.name, website: p.website, description: p.description, hq: { ...EMPTY_LOCATION, country: p.hq_country, city: p.hq_city } } : undefined}
				promotePipelineId={row.id}
				onClose={() => setCreateOpen(false)}
				onSaved={(id) => onCreated(id)}
			/>
		);
	}

	return (
		<Modal title={`Promote ${row.name}`} onClose={onClose} width={520} footer={
			<>
				<button className="btn ghost" onClick={onClose}>Cancel</button>
				<button className="btn" disabled={busy} onClick={() => setCreateOpen(true)}>Create new company →</button>
			</>
		}>
			{isLoading ? <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>Checking for duplicates…</div> : (
				<div style={{ display: 'grid', gap: 12 }}>
					{(preview?.matches.length ?? 0) > 0 ? (
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
					) : (
						<div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>No likely duplicates found. Create a new company with the candidate&apos;s details.</div>
					)}
				</div>
			)}
		</Modal>
	);
}

interface CandRow { name: string; website: string | null; in_database: Array<{ name: string; website: string | null }>; in_queue: Array<{ name: string; website: string | null }>; approved: boolean }

/**
 * Bulk import with a dedupe-review step: paste or upload candidates, preview
 * each against the companies catalog + existing queue, then approve/skip per
 * row before importing. Rows with an existing match are unchecked by default.
 */
function ImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
	const [text, setText] = useState('');
	const [rows, setRows] = useState<CandRow[] | null>(null);
	const [busy, setBusy] = useState(false);

	const review = async () => {
		const parsed = parseCandidates(text);
		if (!parsed.length) { toast.error('Paste or upload at least one candidate'); return; }
		setBusy(true);
		try {
			const r = await api<{ rows: Array<Omit<CandRow, 'approved'>> }>('POST', '/api/admin/startups-pipeline/import-preview', { rows: parsed });
			setRows(r.rows.map((x) => ({ ...x, approved: x.in_database.length === 0 && x.in_queue.length === 0 })));
		} catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
	};

	const importApproved = async () => {
		const approved = (rows ?? []).filter((r) => r.approved).map((r) => ({ name: r.name, website: r.website ?? undefined }));
		if (!approved.length) { toast.error('No candidates approved'); return; }
		setBusy(true);
		try {
			const r = await api<{ inserted: number; skipped: number }>('POST', '/api/admin/startups-pipeline/import', { rows: approved });
			toast.success(`Imported ${r.inserted}${r.skipped ? `, ${r.skipped} dup skipped` : ''}`);
			onSaved();
		} catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
	};

	const toggle = (i: number) => setRows((prev) => prev!.map((r, j) => (j === i ? { ...r, approved: !r.approved } : r)));
	const approvedCount = (rows ?? []).filter((r) => r.approved).length;

	return (
		<Modal title="Bulk import candidates" onClose={onClose} width={640} footer={
			rows
				? <><button className="btn ghost" onClick={() => setRows(null)}>← Back</button><button className="btn" disabled={busy || approvedCount === 0} onClick={() => void importApproved()}>{busy ? 'Importing…' : `Import ${approvedCount} approved`}</button></>
				: <><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !text.trim()} onClick={() => void review()}>{busy ? 'Checking…' : 'Review duplicates →'}</button></>
		}>
			{!rows ? (
				<div style={{ display: 'grid', gap: 8 }}>
					<CandidateInput text={text} onText={setText} sampleName="Acme Sports" placeholder={'Acme Sports, https://acme.com\nhttps://example.io'} />
				</div>
			) : (
				<div style={{ display: 'grid', gap: 8 }}>
					<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{approvedCount}/{rows.length} approved · rows with an existing match are unchecked — tick to import anyway.</div>
					<div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
						<table className="data-table">
							<thead><tr><th style={{ width: 28 }} /><th>Candidate</th><th>Existing matches</th></tr></thead>
							<tbody>
								{rows.map((r, i) => {
									const matches = [...r.in_database.map((m) => ({ ...m, where: 'db' as const })), ...r.in_queue.map((m) => ({ ...m, where: 'queue' as const }))];
									return (
										<tr key={i} style={matches.length ? { background: 'var(--bg-2)' } : undefined}>
											<td><input type="checkbox" checked={r.approved} onChange={() => toggle(i)} /></td>
											<td><div style={{ fontWeight: 600 }}>{r.name}</div>{r.website && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{r.website}</div>}</td>
											<td style={{ fontSize: 12 }}>
												{matches.length === 0 ? <span style={{ color: 'var(--pos)' }}>none — new</span>
													: matches.map((m, k) => <div key={k}><Tag variant={m.where === 'db' ? 'warn' : ''}>{m.where === 'db' ? 'in DB' : 'in queue'}</Tag> {m.name}</div>)}
											</td>
										</tr>
									);
								})}
							</tbody>
						</table>
					</div>
				</div>
			)}
		</Modal>
	);
}

function AddModal({ admins, onClose, onSaved }: { admins: AdminUser[]; onClose: () => void; onSaved: () => void }) {
	const [f, setF] = useState({ name: '', website: '', source: '', notes: '', hq_country: '', hq_city: '', assigned_to: '' });
	const [pending, setPending] = useState(false);
	const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
	const submit = async () => {
		setPending(true);
		try {
			const body: Record<string, unknown> = { name: f.name.trim() };
			for (const k of ['website', 'source', 'notes', 'hq_country', 'hq_city'] as const) if (f[k].trim()) body[k] = f[k].trim();
			if (f.assigned_to) body.assigned_to = f.assigned_to;
			await api('POST', '/api/admin/startups-pipeline', body);
			toast.success('Added to pipeline'); onSaved();
		} catch (e) { toast.error((e as Error).message); } finally { setPending(false); }
	};
	return (
		<Modal title="Add candidate" onClose={onClose} width={480} footer={
			<>
				<button className="btn ghost" onClick={onClose}>Cancel</button>
				<button className="btn" disabled={!f.name.trim() || pending} onClick={() => void submit()}>{pending ? 'Saving…' : 'Add'}</button>
			</>
		}>
			<div style={{ display: 'grid', gap: 12 }}>
				<L label="Name"><input className="search-input" value={f.name} onChange={(e) => set('name', e.target.value)} /></L>
				<L label="Website"><input className="search-input" value={f.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" /></L>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
					<L label="HQ country"><input className="search-input" value={f.hq_country} onChange={(e) => set('hq_country', e.target.value)} /></L>
					<L label="HQ city"><input className="search-input" value={f.hq_city} onChange={(e) => set('hq_city', e.target.value)} /></L>
				</div>
				<L label="Source"><input className="search-input" value={f.source} onChange={(e) => set('source', e.target.value)} placeholder="Twitter, news…" /></L>
				<L label="Assign to">
					<select className="search-input" value={f.assigned_to} onChange={(e) => set('assigned_to', e.target.value)}>
						<option value="">— unassigned —</option>
						{admins.map((a) => <option key={a.id} value={a.id}>{a.full_name || a.display_name || a.email}</option>)}
					</select>
				</L>
				<L label="Notes"><textarea className="search-input" style={{ minHeight: 60, resize: 'vertical' }} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></L>
			</div>
		</Modal>
	);
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
	return <div><div className="co-stat-label" style={{ marginBottom: 6 }}>{label}</div>{children}</div>;
}

/** Per-admin completion progress bars — mirrors the old admin's "Completion by Admin". */
function CompletionByAdmin({ rows, adminName }: { rows: PerAdmin[]; adminName: (id: string | null) => string }) {
	if (!rows.length) return null;
	return (
		<div style={{ marginBottom: 'var(--space-5)' }}>
			<Section title="Completion by admin" meta="processed / assigned">
				<div style={{ display: 'grid', gap: 14 }}>
					{rows.map((a) => {
						const done = a.added + a.rejected;
						const total = done + a.pending;
						const rate = a.completion_rate;
						return (
							<div key={a.assigned_to}>
								<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, gap: 12 }}>
									<span style={{ fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.full_name ?? adminName(a.assigned_to)}</span>
									<span style={{ color: 'var(--fg-muted)', flexShrink: 0 }}>{done}/{total} completed <strong style={{ color: 'var(--fg)' }}>{rate}%</strong></span>
								</div>
								<div style={{ height: 8, borderRadius: 999, background: 'var(--bg-3)', overflow: 'hidden' }}>
									<div style={{ width: `${Math.min(Math.max(rate, 0), 100)}%`, height: '100%', background: 'var(--pos)', borderRadius: 999, transition: 'width .3s ease' }} />
								</div>
							</div>
						);
					})}
				</div>
			</Section>
		</div>
	);
}

/** Per-admin work-time table (Total Time / Avg-per-item / Completed) + overall-average footer. */
function TimeAnalytics({ timeStats, adminName }: { timeStats?: TimeStats; adminName: (id: string | null) => string }) {
	const rows = timeStats?.perAdmin ?? [];
	const t = timeStats?.totals;
	const overall = t && t.items > 0 ? Math.round(t.total_seconds / t.items) : 0;
	return (
		<Section title="Time analytics" meta="work time per admin">
			{rows.length === 0 ? <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>No time data yet</div> : (
				<table className="data-table">
					<thead><tr><th>Admin</th><th style={{ textAlign: 'right' }}>Total Time</th><th style={{ textAlign: 'right' }}>Avg/Item</th><th style={{ textAlign: 'right' }}>Completed</th></tr></thead>
					<tbody>
						{rows.map((r) => (
							<tr key={r.admin_id}>
								<td>{r.full_name ?? adminName(r.admin_id)}</td>
								<td className="num">{fmtDur(r.total_seconds)}</td>
								<td className="num">{fmtDur(r.avg_seconds_per_item)}</td>
								<td className="num">{r.items}</td>
							</tr>
						))}
					</tbody>
					<tfoot><tr><td colSpan={3} style={{ color: 'var(--fg-muted)' }}>Overall Average</td><td className="num" style={{ fontWeight: 700 }}>{overall ? `${fmtDur(overall)}/item` : '—'}</td></tr></tfoot>
				</table>
			)}
		</Section>
	);
}

/** This-week vs last-week throughput with colored deltas — mirrors "Weekly Metrics". */
function WeeklyMetrics({ weekly }: { weekly?: Stats['weekly'] }) {
	const w = weekly;
	const metric = (label: string, cur: number, prev: number, fmt: (n: number) => string, goodDown = false) => {
		const change = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : (cur > 0 ? 100 : 0);
		const positive = goodDown ? change <= 0 : change >= 0;
		return (
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 0', borderBottom: '1px solid var(--border)' }}>
				<div>
					<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{label}</div>
					<div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em' }}>{fmt(cur)}</div>
				</div>
				<div style={{ textAlign: 'right' }}>
					<span className={`tag ${positive ? 'pos' : 'neg'}`}>{change >= 0 ? '▲' : '▼'} {change >= 0 ? '+' : ''}{change}%</span>
					<div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>vs {fmt(prev)}</div>
				</div>
			</div>
		);
	};
	return (
		<Section title="Weekly metrics" meta="this week vs last">
			{!w ? <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>No weekly data</div> : (
				<div>
					{metric('Startups Added', w.added_this_week, w.added_last_week, (n) => n.toLocaleString())}
					{metric('Carried Forward', w.carried, w.carried_last_week ?? 0, (n) => n.toLocaleString(), true)}
					{metric('Avg Per Day', w.avg_per_day ?? 0, w.avg_per_day_last_week ?? 0, (n) => n.toFixed(1))}
				</div>
			)}
		</Section>
	);
}
