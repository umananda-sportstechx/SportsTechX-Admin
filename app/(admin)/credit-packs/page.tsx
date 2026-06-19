'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Package, Plus, Archive } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Admin credit-pack management. Creating a pack mints a Stripe one-time Product +
 * Price on the server, then stores the row. The public store
 * (GET /api/billing/credit-packs) + checkout consume these; the webhook grants
 * the credits as a non-expiring top-up on payment.
 *
 *   GET    /api/admin/credit-packs
 *   POST   /api/admin/credit-packs
 *   PATCH  /api/admin/credit-packs/:id
 *   DELETE /api/admin/credit-packs/:id
 */
interface CreditPack {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	credit_type: 'ai' | 'integration' | string;
	credit_amount: number;
	price_amount: number; // cents
	currency_code: string;
	stripe_price_id: string | null;
	is_active: boolean;
	sort_order: number;
}

export default function CreditPacksAdminPage() {
	const { data, mutate, isLoading } = useSWR<{ data: CreditPack[] }>(['/api/admin/credit-packs']);
	const packs = data?.data ?? [];

	const [slug, setSlug] = useState('');
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [creditType, setCreditType] = useState<'ai' | 'integration'>('ai');
	const [creditAmount, setCreditAmount] = useState(1000);
	const [priceEuros, setPriceEuros] = useState(10);
	const [sortOrder, setSortOrder] = useState(0);
	const [busy, setBusy] = useState(false);

	const create = async () => {
		setBusy(true);
		try {
			await api('POST', '/api/admin/credit-packs', {
				slug: slug.trim(),
				name: name.trim(),
				description: description.trim() || null,
				credit_type: creditType,
				credit_amount: creditAmount,
				price_amount: Math.round(priceEuros * 100),
				currency_code: 'EUR',
				sort_order: sortOrder,
			});
			toast.success('Credit pack created (Stripe price minted)');
			setSlug(''); setName(''); setDescription('');
			await mutate();
		} catch (e) {
			toast.error((e as Error).message ?? 'Could not create pack');
		} finally {
			setBusy(false);
		}
	};

	const toggleActive = async (p: CreditPack) => {
		try {
			await api('PATCH', `/api/admin/credit-packs/${p.id}`, { is_active: !p.is_active });
			await mutate();
		} catch (e) {
			toast.error((e as Error).message ?? 'Update failed');
		}
	};

	const archive = async (p: CreditPack) => {
		if (!confirm(`Archive "${p.name}"? It will be removed from the store and its Stripe price archived.`)) return;
		try {
			await api('DELETE', `/api/admin/credit-packs/${p.id}`);
			toast.success('Pack archived');
			await mutate();
		} catch (e) {
			toast.error((e as Error).message ?? 'Archive failed');
		}
	};

	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
					<Package size={11} style={{ verticalAlign: '-1px' }} /> Billing · add-ons
				</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>
					Credit packs
				</h1>
				<p style={{ fontSize: 14, color: 'var(--fg-2)', maxWidth: 720, margin: '6px 0 0' }}>
					One-time, non-expiring credit top-ups users can buy when their plan credits run out.
					Creating a pack mints the Stripe product + price automatically. Price is immutable once
					created — to change it, archive and create a new pack.
				</p>
			</div>

			{/* Create */}
			<div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
					<Plus size={16} /> <div style={{ fontWeight: 700 }}>New credit pack</div>
				</div>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
					<Field label="Slug (e.g. ai-1k)"><input className="search-input" style={{ width: '100%' }} value={slug} onChange={(e) => setSlug(e.target.value)} /></Field>
					<Field label="Name"><input className="search-input" style={{ width: '100%' }} value={name} onChange={(e) => setName(e.target.value)} /></Field>
					<Field label="Credit type">
						<div style={{ display: 'flex', gap: 6 }}>
							<button type="button" className={`chip ${creditType === 'ai' ? 'on' : ''}`} onClick={() => setCreditType('ai')}>AI</button>
							<button type="button" className={`chip ${creditType === 'integration' ? 'on' : ''}`} onClick={() => setCreditType('integration')}>Integration</button>
						</div>
					</Field>
					<Field label="Credits"><input className="search-input" type="number" min={1} style={{ width: '100%' }} value={creditAmount} onChange={(e) => setCreditAmount(Math.max(1, Number(e.target.value) || 1))} /></Field>
					<Field label="Price (EUR)"><input className="search-input" type="number" min={1} step={0.5} style={{ width: '100%' }} value={priceEuros} onChange={(e) => setPriceEuros(Math.max(0.5, Number(e.target.value) || 0.5))} /></Field>
					<Field label="Sort order"><input className="search-input" type="number" style={{ width: '100%' }} value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value) || 0)} /></Field>
					<div style={{ gridColumn: '1 / -1' }}>
						<Field label="Description (optional)"><input className="search-input" style={{ width: '100%' }} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
					</div>
				</div>
				<button className="btn" style={{ marginTop: 14 }} disabled={busy || !slug.trim() || !name.trim()} onClick={() => void create()}>
					{busy ? 'Creating…' : 'Create pack'}
				</button>
			</div>

			{/* List */}
			<div className="card" style={{ padding: 'var(--space-4)' }}>
				<div style={{ fontWeight: 700, marginBottom: 10 }}>All packs</div>
				<table className="data-table">
					<thead><tr><th>Name</th><th>Type</th><th>Credits</th><th>Price</th><th>Active</th><th></th></tr></thead>
					<tbody>
						{isLoading && <tr><td colSpan={6} style={{ color: 'var(--fg-muted)' }}>Loading…</td></tr>}
						{!isLoading && packs.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--fg-muted)' }}>No credit packs yet.</td></tr>}
						{packs.map((p) => (
							<tr key={p.id}>
								<td><div style={{ fontWeight: 600 }}>{p.name}</div><div style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)' }}>{p.slug}</div></td>
								<td>{p.credit_type}</td>
								<td className="num">{p.credit_amount.toLocaleString()}</td>
								<td className="num">{(p.price_amount / 100).toLocaleString(undefined, { style: 'currency', currency: p.currency_code })}</td>
								<td>
									<button type="button" className={`chip ${p.is_active ? 'on' : ''}`} onClick={() => void toggleActive(p)}>
										{p.is_active ? 'Active' : 'Inactive'}
									</button>
								</td>
								<td style={{ textAlign: 'right' }}>
									<button className="btn ghost" onClick={() => void archive(p)} title="Archive"><Archive size={12} /></button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
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
