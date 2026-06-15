'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/confirm';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState } from '@/components/atoms';

interface FeatureRow {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	category: string | null;
	sort_order: number;
	free: boolean;
	growth: boolean;
	pro: boolean;
	is_active: boolean;
}

type Tier = 'free' | 'growth' | 'pro';

const TIERS: Tier[] = ['free', 'growth', 'pro'];

interface FeaturesResponse { data: FeatureRow[] }

export default function FeaturesAdminPage() {
	const ask = useConfirm();
	const [includeInactive, setIncludeInactive] = useState(false);
	const { data, mutate, isLoading, error } = useSWR<FeaturesResponse>(['/api/admin/features', { include_inactive: includeInactive || undefined }]);
	const [creating, setCreating] = useState(false);
	const [editing, setEditing] = useState<FeatureRow | null>(null);

	const reactivate = async (row: FeatureRow) => {
		try {
			await api('PATCH', `/api/admin/features/${row.id}`, { is_active: true });
			toast.success(`Reactivated ${row.slug}`);
			void mutate();
		} catch (e) {
			toast.error((e as Error).message ?? 'Could not reactivate');
		}
	};

	const toggleTier = async (row: FeatureRow, tier: Tier) => {
		const next = { free: row.free, growth: row.growth, pro: row.pro, [tier]: !row[tier] };
		const optimistic: FeaturesResponse = {
			data: (data?.data ?? []).map((r) => (r.id === row.id ? { ...r, ...next } : r)),
		};
		try {
			await mutate(
				async () => {
					await api('PATCH', `/api/admin/features/${row.id}`, { tiers: next });
					return optimistic;
				},
				{ optimisticData: optimistic, rollbackOnError: true, revalidate: true },
			);
		} catch (e) {
			toast.error((e as Error).message ?? 'Could not update');
		}
	};

	const deactivate = async (row: FeatureRow) => {
		if (!(await ask(`Deactivate "${row.name}"? It stays in the DB but is hidden from the catalog.`))) return;
		try {
			await api('DELETE', `/api/admin/features/${row.id}`);
			toast.success(`Deactivated ${row.slug}`);
			void mutate();
		} catch (e) {
			toast.error((e as Error).message ?? 'Could not deactivate');
		}
	};

	const rows = data?.data ?? [];

	return (
		<div>
			<PageHeader
				kicker="Feature flags · tier gating"
				title="Feature flags"
				subtitle="Edits go live on the public /api/features response on the next request (5-min cache, invalidated on write). Per-user overrides live separately in profile_feature_grants."
			/>

			<div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginBottom: 12 }}>
				<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
					<input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} /> Show inactive
				</label>
				<button className="btn" onClick={() => setCreating(true)}>
					<Plus size={12} /> Add feature
				</button>
			</div>

			{(creating || editing) && (
				<FeatureModal
					initial={editing}
					onClose={() => { setCreating(false); setEditing(null); }}
					onSaved={() => { setCreating(false); setEditing(null); void mutate(); }}
				/>
			)}

			<div className="card" style={{ padding: 0, overflow: 'hidden' }}>
				<AsyncState loading={isLoading} error={error} empty={rows.length === 0} emptyMsg="No features yet — add one." onRetry={() => void mutate()}>
				<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
					<thead>
						<tr style={{ background: 'var(--bg-2)', textAlign: 'left' }}>
							<th style={th}>Name</th>
							<th style={th}>Slug</th>
							<th style={th}>Category</th>
							<th style={{ ...th, textAlign: 'center', width: 70 }}>Free</th>
							<th style={{ ...th, textAlign: 'center', width: 70 }}>Growth</th>
							<th style={{ ...th, textAlign: 'center', width: 70 }}>Pro</th>
							<th style={{ ...th, width: 80 }} />
						</tr>
					</thead>
					<tbody>
						{rows.map((row) => (
							<tr key={row.id} style={{ borderTop: '1px solid var(--border)', opacity: row.is_active ? 1 : 0.5 }}>
								<td style={td}>
									<div style={{ fontWeight: 600 }}>{row.name}{!row.is_active && <span className="tag" style={{ marginLeft: 6 }}>inactive</span>}</div>
									{row.description && <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{row.description}</div>}
								</td>
								<td style={{ ...td, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{row.slug}</td>
								<td style={{ ...td, color: 'var(--fg-2)' }}>{row.category ?? '—'}</td>
								{TIERS.map((t) => (
									<td key={t} style={{ ...td, textAlign: 'center' }}>
										<button
											className={`chip ${row[t] ? 'on' : ''}`}
											style={{ minWidth: 32 }}
											onClick={() => void toggleTier(row, t)}
											aria-label={`Toggle ${t} for ${row.slug}`}
										>
											{row[t] ? '✓' : '·'}
										</button>
									</td>
								))}
								<td style={{ ...td, textAlign: 'right' }}>
									<div style={{ display: 'inline-flex', gap: 6, justifyContent: 'flex-end' }}>
										<button className="btn ghost" onClick={() => setEditing(row)}>Edit</button>
										{row.is_active ? (
											<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void deactivate(row)} title="Deactivate">
												<Trash2 size={12} />
											</button>
										) : (
											<button className="btn ghost" onClick={() => void reactivate(row)} title="Reactivate">Reactivate</button>
										)}
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

const th: React.CSSProperties = { padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)' };
const td: React.CSSProperties = { padding: '12px' };

function FeatureModal({ initial, onClose, onSaved }: { initial: FeatureRow | null; onClose: () => void; onSaved: () => void }) {
	const isEdit = !!initial;
	const [slug, setSlug] = useState(initial?.slug ?? '');
	const [name, setName] = useState(initial?.name ?? '');
	const [description, setDescription] = useState(initial?.description ?? '');
	const [category, setCategory] = useState(initial?.category ?? '');
	const [sortOrder, setSortOrder] = useState(initial?.sort_order ?? 999);
	const [tiers, setTiers] = useState({ free: initial?.free ?? false, growth: initial?.growth ?? true, pro: initial?.pro ?? true });
	const [pending, setPending] = useState(false);

	const submit = async () => {
		setPending(true);
		try {
			if (isEdit) {
				await api('PATCH', `/api/admin/features/${initial!.id}`, {
					name: name.trim(),
					description: description.trim() || null,
					category: category.trim() || null,
					sort_order: sortOrder,
					tiers,
				});
				toast.success(`Saved ${slug}`);
			} else {
				await api('POST', '/api/admin/features', {
					slug: slug.trim(),
					name: name.trim(),
					description: description.trim() || null,
					category: category.trim() || null,
					sort_order: sortOrder,
					tiers,
				});
				toast.success(`Created ${slug}`);
			}
			onSaved();
		} catch (e) {
			toast.error((e as Error).message ?? 'Could not save');
		} finally {
			setPending(false);
		}
	};

	return (
		<Modal
			title={isEdit ? 'Edit feature' : 'New feature'}
			onClose={onClose}
			width={520}
			footer={
				<>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={!slug.trim() || !name.trim() || pending} onClick={() => void submit()}>
						<Save size={12} /> {pending ? 'Saving…' : 'Save'}
					</button>
				</>
			}
		>
			<div style={{ display: 'grid', gap: 12 }}>
				<Field label={isEdit ? 'Slug (immutable)' : 'Slug (lowercase, _ allowed)'}>
					<input className="search-input" style={{ width: '100%', fontFamily: 'var(--font-mono)' }} placeholder="csv_export" value={slug} disabled={isEdit} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} />
				</Field>
				<Field label="Display name">
					<input className="search-input" style={{ width: '100%' }} placeholder="CSV export" value={name} onChange={(e) => setName(e.target.value)} />
				</Field>
				<Field label="Description (optional)">
					<textarea className="search-input" style={{ width: '100%', minHeight: 60, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} />
				</Field>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
					<Field label="Category">
						<input className="search-input" style={{ width: '100%' }} placeholder="export, analytics, ai…" value={category} onChange={(e) => setCategory(e.target.value)} />
					</Field>
					<Field label="Sort">
						<input className="search-input" type="number" style={{ width: '100%' }} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 999)} />
					</Field>
				</div>
				<Field label="Tier access">
					<div style={{ display: 'flex', gap: 6 }}>
						{TIERS.map((t) => (
							<button
								key={t}
								type="button"
								className={`chip ${tiers[t] ? 'on' : ''}`}
								onClick={() => setTiers({ ...tiers, [t]: !tiers[t] })}
							>
								{t}
							</button>
						))}
					</div>
				</Field>
			</div>
		</Modal>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="co-stat-label" style={{ marginBottom: 6 }}>{label}</div>
			{children}
		</div>
	);
}
