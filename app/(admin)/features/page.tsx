'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Plus, Save, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';

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
	const { data, mutate, isLoading } = useSWR<FeaturesResponse>(['/api/admin/features']);
	const [creating, setCreating] = useState(false);

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
		if (!confirm(`Deactivate "${row.name}"? It stays in the DB but is hidden from the catalog.`)) return;
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
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div className="co-stat-label" style={{ marginBottom: 6 }}>Feature catalog</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>
					Tier × feature matrix
				</h1>
				<p style={{ fontSize: 14, color: 'var(--fg-2)', maxWidth: 720, margin: '6px 0 0' }}>
					Edits here become live on the public <code style={{ background: 'var(--bg-2)', padding: '0 4px' }}>/api/features</code> response on the next request (5-min cache, invalidated on every write).
					Per-user overrides live separately in <code style={{ background: 'var(--bg-2)', padding: '0 4px' }}>profile_feature_grants</code>.
				</p>
			</div>

			<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
				<button className="btn" onClick={() => setCreating(true)}>
					<Plus size={12} /> Add feature
				</button>
			</div>

			{creating && (
				<CreateModal
					onClose={() => setCreating(false)}
					onCreated={() => { setCreating(false); void mutate(); }}
				/>
			)}

			<div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
						{isLoading && (
							<tr><td colSpan={7} style={{ padding: 24, color: 'var(--fg-muted)', textAlign: 'center' }}>Loading…</td></tr>
						)}
						{!isLoading && rows.length === 0 && (
							<tr><td colSpan={7} style={{ padding: 24, color: 'var(--fg-muted)', textAlign: 'center' }}>No features yet — add one.</td></tr>
						)}
						{rows.map((row) => (
							<tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
								<td style={td}>
									<div style={{ fontWeight: 600 }}>{row.name}</div>
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
									<button
										className="btn ghost"
										style={{ color: 'var(--accent)' }}
										onClick={() => void deactivate(row)}
										title="Deactivate"
									>
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

const th: React.CSSProperties = { padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--fg-muted)' };
const td: React.CSSProperties = { padding: '12px' };

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
	const [slug, setSlug] = useState('');
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [category, setCategory] = useState('');
	const [sortOrder, setSortOrder] = useState(999);
	const [tiers, setTiers] = useState({ free: false, growth: true, pro: true });
	const [pending, setPending] = useState(false);

	const submit = async () => {
		setPending(true);
		try {
			await api('POST', '/api/admin/features', {
				slug: slug.trim(),
				name: name.trim(),
				description: description.trim() || null,
				category: category.trim() || null,
				sort_order: sortOrder,
				tiers,
			});
			toast.success(`Created ${slug}`);
			onCreated();
		} catch (e) {
			toast.error((e as Error).message ?? 'Could not create');
		} finally {
			setPending(false);
		}
	};

	return (
		<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 100 }} onClick={onClose}>
			<div className="card" style={{ width: 'min(520px, 92vw)', padding: 'var(--space-4)' }} onClick={(e) => e.stopPropagation()}>
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
					<div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>New feature</div>
					<button className="btn ghost" onClick={onClose}><X size={12} /></button>
				</div>

				<div style={{ display: 'grid', gap: 12 }}>
					<Field label="Slug (lowercase, _ allowed)">
						<input className="search-input" style={{ width: '100%', fontFamily: 'var(--font-mono)' }} placeholder="csv_export" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))} />
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

				<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={!slug.trim() || !name.trim() || pending} onClick={() => void submit()}>
						<Save size={12} /> {pending ? 'Creating…' : 'Create'}
					</button>
				</div>
			</div>
		</div>
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
