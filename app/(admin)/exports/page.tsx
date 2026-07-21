'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Download, RefreshCw, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/atoms';

/**
 * Export field configuration.
 *
 * Controls WHICH columns users may export (and map to their CRM), per entity.
 * The full column catalogue lives in the server (`export-columns.ts`); this page
 * only toggles columns on/off. A column left enabled is exportable; disabling it
 * withholds it from every user's export + CRM mapping.
 *
 *   GET /api/admin/exports/config         → { [entity]: { label, columns[] } }
 *   PUT /api/admin/exports/config/:entity → persist on/off + per-column credit
 *
 * Each column has a per-row credit cost (default 0.5). An export/sync costs the
 * user ceil( sum(selected column costs) × rows ) from the integration-credit pool.
 */

interface ColumnRow { key: string; label: string; enabled: boolean; sort_order: number; credit_cost: number }
type ConfigResp = Record<string, { label: string; columns: ColumnRow[] }>;

export default function ExportsConfigPage() {
	const { data, mutate, isLoading } = useSWR<ConfigResp>(['/api/admin/exports/config'], { dedupingInterval: 30_000 });

	return (
		<div>
			<PageHeader
				kicker="Data export"
				title="Export columns"
				subtitle="Choose which columns users can export to CSV/XLSX or map to their CRM, and set each column's per-row credit cost (default 0.5). An export costs ceil(sum of selected column costs × rows) from the export-credit pool."
			/>

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				<div style={{ flex: 1 }} />
				<button className="btn ghost" onClick={() => void mutate()}><RefreshCw size={12} /> Refresh</button>
			</div>

			{isLoading && <div style={{ color: 'var(--fg-muted)' }}>Loading…</div>}

			{data && Object.entries(data).map(([entity, cfg]) => (
				<EntityCard key={entity} entity={entity} label={cfg.label} columns={cfg.columns} onSaved={() => void mutate()} />
			))}
		</div>
	);
}

function EntityCard({
	entity, label, columns, onSaved,
}: { entity: string; label: string; columns: ColumnRow[]; onSaved: () => void }) {
	const [state, setState] = useState<Record<string, boolean>>(
		() => Object.fromEntries(columns.map((c) => [c.key, c.enabled])),
	);
	const [costs, setCosts] = useState<Record<string, string>>(
		() => Object.fromEntries(columns.map((c) => [c.key, String(c.credit_cost)])),
	);
	const [saving, setSaving] = useState(false);

	const dirty = columns.some((c) => state[c.key] !== c.enabled || Number(costs[c.key]) !== c.credit_cost);
	const enabledCount = columns.filter((c) => state[c.key]).length;

	const toggle = (key: string) => setState((s) => ({ ...s, [key]: !s[key] }));
	const setCost = (key: string, v: string) => setCosts((s) => ({ ...s, [key]: v }));

	const save = async () => {
		if (enabledCount === 0) { toast.error('Keep at least one column exportable'); return; }
		setSaving(true);
		try {
			await api('PUT', `/api/admin/exports/config/${entity}`, {
				columns: columns.map((c, i) => ({
					column_key: c.key,
					is_enabled: !!state[c.key],
					sort_order: i,
					credit_cost: Math.max(0, Math.min(999.99, Number(costs[c.key]) || 0)),
				})),
			});
			toast.success(`${label} export columns saved`);
			onSaved();
		} catch (e) { toast.error((e as Error).message); }
		finally { setSaving(false); }
	};

	return (
		<div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
				<div style={{ fontWeight: 700 }}>
					{label}
					<span style={{ fontWeight: 400, color: 'var(--fg-muted)', fontSize: 12, marginLeft: 8 }}>
						{enabledCount}/{columns.length} exportable
					</span>
				</div>
				<button className="btn" disabled={!dirty || saving} onClick={() => void save()}>
					<Save size={12} /> {saving ? 'Saving…' : 'Save'}
				</button>
			</div>
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
				{columns.map((c) => (
					<label
						key={c.key}
						style={{
							display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
							padding: '8px 10px', borderRadius: 8,
							border: '1px solid var(--border)',
							background: state[c.key] ? 'var(--bg-2)' : 'transparent',
							opacity: state[c.key] ? 1 : 0.55,
						}}
					>
						<input type="checkbox" checked={!!state[c.key]} onChange={() => toggle(c.key)} />
						<span style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.key}>{c.label}</span>
						<span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 3 }} onClick={(e) => e.preventDefault()}>
							<input
								type="number" step="0.5" min="0"
								value={costs[c.key] ?? ''}
								onChange={(e) => setCost(c.key, e.target.value)}
								disabled={!state[c.key]}
								title="Per-row credit cost"
								style={{ width: 52, height: 24, padding: '0 6px', fontSize: 12, fontFamily: 'var(--font-mono)', textAlign: 'right', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-1)' }}
							/>
							<span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>cr</span>
						</span>
					</label>
				))}
			</div>
		</div>
	);
}
