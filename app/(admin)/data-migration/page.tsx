'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PageHeader, AsyncState, Section } from '@/components/atoms';

/**
 * Old → new data migration. While both systems run, the pipeline
 * (server/scripts/migration/pipeline) re-syncs the old database into this one:
 * old-side edits flow across, new-side edits are never overwritten, and a field
 * changed on both sides lands here as a conflict (the new value stays until an
 * admin chooses). The cutover phase tracks the move off the old system.
 */
type Phase = 'dual_running' | 'old_frozen' | 'final_sync' | 'verified' | 'complete';
interface TableRow { table_name: string; mode: 'dry_run' | 'apply'; started_at: string; extract_at: string | null; inserted: number; updated: number; skipped: number; reviewed: number; conflicts: number }
interface Run { id: string; kind: string; mode: string; status: string; started_at: string; finished_at: string | null; extract_at: string | null }
interface Status {
	ready: boolean;
	cutover?: { phase: Phase; frozen_at: string | null; verified_at: string | null; notes: string | null; updated_at: string; updated_by: string | null };
	runs?: Run[];
	tables?: TableRow[];
	conflicts?: { entity: string; open: number }[];
}
interface Conflict { id: number; entity: string; target_id: string; label: string | null; col: string; base_value: unknown; old_value: unknown; new_value: unknown; created_at: string }

const PHASES: { key: Phase; label: string; hint: string }[] = [
	{ key: 'dual_running', label: 'Both systems live', hint: 'Re-sync as often as needed.' },
	{ key: 'old_frozen', label: 'Old system frozen', hint: 'Signups and edits stopped on the old system.' },
	{ key: 'final_sync', label: 'Final sync', hint: 'Last extract taken after the freeze, synced and applied.' },
	{ key: 'verified', label: 'Verified', hint: 'Cutover check passed: nothing left to move, no open conflicts.' },
	{ key: 'complete', label: 'Complete', hint: 'The old database is retired.' },
];

const when = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : '—');
const show = (v: unknown) => (v === null || v === undefined || v === '' ? <em style={{ color: 'var(--fg-muted)' }}>empty</em> : typeof v === 'object' ? JSON.stringify(v) : String(v));

export default function DataMigrationPage() {
	const status = useSWR<Status>('/api/admin/migration/status');
	const conflicts = useSWR<Conflict[]>(status.data?.ready ? '/api/admin/migration/conflicts' : null);
	const [busy, setBusy] = useState<string | null>(null);

	const tables = status.data?.tables ?? [];
	const byTable = new Map<string, { dry?: TableRow; apply?: TableRow }>();
	for (const t of tables) byTable.set(t.table_name, { ...byTable.get(t.table_name), [t.mode === 'apply' ? 'apply' : 'dry']: t });
	const openBy = new Map((status.data?.conflicts ?? []).map((c) => [c.entity, c.open]));
	const phase = status.data?.cutover?.phase ?? 'dual_running';

	const setPhase = async (next: Phase) => {
		setBusy('phase');
		try {
			await api('POST', '/api/admin/migration/cutover', { phase: next });
			await status.mutate();
			toast.success('Cutover phase updated');
		} catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
	};
	const resolve = async (id: number, action: 'use_old' | 'keep_new') => {
		setBusy(`c${id}`);
		try {
			await api('POST', `/api/admin/migration/conflicts/${id}/resolve`, { action });
			await Promise.all([conflicts.mutate(), status.mutate()]);
			toast.success(action === 'use_old' ? 'Old value applied' : 'Kept the new value');
		} catch (e) { toast.error((e as Error).message); } finally { setBusy(null); }
	};

	return (
		<>
			<PageHeader kicker="System" title="Data migration" subtitle="Moving data from the old system into this one while both run. Old-side edits sync across; changes made here are never overwritten." />
			<AsyncState loading={status.isLoading} error={status.error} onRetry={() => void status.mutate()}>
				{status.data && !status.data.ready ? (
					<Section title="Not set up yet">
						<p style={{ fontSize: 13, color: 'var(--fg-2)' }}>The migration tracking tables don’t exist yet. Apply migration <code>20261030102851_migration_tracking</code> (<code>npx supabase db push</code> in <code>server/</code>).</p>
					</Section>
				) : (
					<>
						<Section title="Cutover" meta={PHASES.find((p) => p.key === phase)?.label}>
							<ol style={{ display: 'flex', gap: 8, flexWrap: 'wrap', listStyle: 'none', padding: 0, margin: 0 }}>
								{PHASES.map((p, i) => {
									const idx = PHASES.findIndex((x) => x.key === phase);
									return (
										<li key={p.key} style={{ flex: '1 1 160px', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: i === idx ? 'var(--bg-3)' : 'var(--bg-1)', opacity: i > idx ? 0.6 : 1 }}>
											<div style={{ fontSize: 12, fontWeight: 700 }}>{i + 1}. {p.label}{i < idx ? ' ✓' : ''}</div>
											<div style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 4 }}>{p.hint}</div>
											{i === idx + 1 && (
												<button className="btn ghost" style={{ marginTop: 8, fontSize: 12 }} disabled={busy === 'phase'} onClick={() => void setPhase(p.key)}>Mark as reached</button>
											)}
										</li>
									);
								})}
							</ol>
							<div style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', marginTop: 10 }}>
								updated {when(status.data?.cutover?.updated_at)}{status.data?.cutover?.updated_by ? ` by ${status.data.cutover.updated_by}` : ''}
								{status.data?.cutover?.frozen_at ? ` · frozen ${when(status.data.cutover.frozen_at)}` : ''}
							</div>
						</Section>

						<Section title="Tables" meta="Latest apply vs latest dry run" padded={false}>
							<table className="data-table">
								<thead><tr><th>Table</th><th>Status</th><th>Last applied</th><th>Applied +new / ~updated</th><th>Last dry run</th><th>Pending +new / ~updated</th><th>Open conflicts</th></tr></thead>
								<tbody>
									{[...byTable.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, t]) => {
										const pendingRun = t.dry && (!t.apply || t.dry.started_at > t.apply.started_at) ? t.dry : undefined;
										const pending = pendingRun ? pendingRun.inserted + pendingRun.updated : 0;
										const open = openBy.get(name) ?? 0;
										const state = open ? 'Conflicts to review' : pending ? 'Behind' : 'In sync';
										const color = open ? 'var(--warn, #d97706)' : pending ? 'var(--accent)' : 'var(--success, #16a34a)';
										return (
											<tr key={name}>
												<td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{name}</td>
												<td><span className="tag" style={{ color }}>{state}</span></td>
												<td>{when(t.apply?.started_at)}</td>
												<td>{t.apply ? `+${t.apply.inserted} / ~${t.apply.updated}` : '—'}</td>
												<td>{when(t.dry?.started_at)}</td>
												<td>{pendingRun ? `+${pendingRun.inserted} / ~${pendingRun.updated}` : '0'}</td>
												<td>{open || '—'}</td>
											</tr>
										);
									})}
									{byTable.size === 0 && <tr><td colSpan={7} style={{ color: 'var(--fg-muted)' }}>No sync runs recorded yet.</td></tr>}
								</tbody>
							</table>
						</Section>

						<Section title="Conflicts" meta="Changed on both sides — the new value is kept until you choose" padded={false}>
							<AsyncState loading={conflicts.isLoading} error={conflicts.error} empty={(conflicts.data ?? []).length === 0} emptyMsg="No open conflicts" onRetry={() => void conflicts.mutate()}>
								<table className="data-table">
									<thead><tr><th>Record</th><th>Field</th><th>Was</th><th>Old system now</th><th>This system now</th><th /></tr></thead>
									<tbody>
										{(conflicts.data ?? []).map((k) => (
											<tr key={k.id}>
												<td><div style={{ fontWeight: 600 }}>{k.label ?? k.target_id}</div><div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{k.entity}</div></td>
												<td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{k.col}</td>
												<td style={{ maxWidth: 220 }}>{show(k.base_value)}</td>
												<td style={{ maxWidth: 220 }}>{show(k.old_value)}</td>
												<td style={{ maxWidth: 220 }}>{show(k.new_value)}</td>
												<td style={{ whiteSpace: 'nowrap' }}>
													<button className="btn ghost" disabled={busy === `c${k.id}`} onClick={() => void resolve(k.id, 'use_old')}>Use old</button>{' '}
													<button className="btn ghost" disabled={busy === `c${k.id}`} onClick={() => void resolve(k.id, 'keep_new')}>Keep new</button>
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</AsyncState>
						</Section>

						<Section title="Runs" meta="Most recent 30" padded={false}>
							<table className="data-table">
								<thead><tr><th>Started</th><th>What</th><th>Mode</th><th>Result</th><th>Old snapshot</th></tr></thead>
								<tbody>
									{(status.data?.runs ?? []).map((r) => (
										<tr key={r.id}>
											<td>{when(r.started_at)}</td>
											<td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.kind}</td>
											<td>{r.mode === 'apply' ? 'Applied' : 'Dry run'}</td>
											<td>{r.status === 'committed' ? 'Committed' : r.status === 'rolled_back' ? 'Dry run (nothing written)' : r.status}</td>
											<td>{when(r.extract_at)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</Section>
					</>
				)}
			</AsyncState>
		</>
	);
}
