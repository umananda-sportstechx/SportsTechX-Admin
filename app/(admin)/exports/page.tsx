'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Download, RefreshCw, Save } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Export field configuration.
 *
 * Controls WHICH columns users may export (and map to their CRM), per entity.
 * The full column catalogue lives in the server (`export-columns.ts`); this page
 * only toggles columns on/off. A column left enabled is exportable; disabling it
 * withholds it from every user's export + CRM mapping.
 *
 *   GET /api/admin/exports/config         → { [entity]: { label, columns[] } }
 *   PUT /api/admin/exports/config/:entity → persist on/off overrides
 *
 * Exporting costs users 1 export credit per row (integration-credit pool); that
 * cost is fixed and not configured here.
 */

interface ColumnRow { key: string; label: string; enabled: boolean; sort_order: number }
type ConfigResp = Record<string, { label: string; columns: ColumnRow[] }>;

export default function ExportsConfigPage() {
	const { data, mutate, isLoading } = useSWR<ConfigResp>(['/api/admin/exports/config'], { dedupingInterval: 30_000 });

	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
				<div>
					<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
						<Download size={11} style={{ verticalAlign: '-1px' }} /> Data export
					</div>
					<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>
						Export columns
					</h1>
					<p style={{ fontSize: 14, color: 'var(--fg-2)', maxWidth: 760, margin: '6px 0 0' }}>
						Choose which columns users can export to CSV/XLSX or map to their CRM, per dataset.
						Disabled columns are hidden from every user&apos;s export picker. Exports cost users
						<b> 1 export credit per row</b> (the same pool covers CRM syncs).
					</p>
				</div>
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
	const [saving, setSaving] = useState(false);

	const dirty = columns.some((c) => state[c.key] !== c.enabled);
	const enabledCount = columns.filter((c) => state[c.key]).length;

	const toggle = (key: string) => setState((s) => ({ ...s, [key]: !s[key] }));

	const save = async () => {
		if (enabledCount === 0) { toast.error('Keep at least one column exportable'); return; }
		setSaving(true);
		try {
			await api('PUT', `/api/admin/exports/config/${entity}`, {
				columns: columns.map((c, i) => ({ column_key: c.key, is_enabled: !!state[c.key], sort_order: i })),
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
						<span style={{ fontSize: 13 }}>{c.label}</span>
						<span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)' }}>{c.key}</span>
					</label>
				))}
			</div>
		</div>
	);
}
