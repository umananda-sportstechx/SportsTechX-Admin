'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Save, X } from 'lucide-react';
import { api } from '@/lib/api';

interface Plan {
	id: string;
	stripe_price_id: string;
	stripe_product_id: string;
	name: string;
	slug: string;
	description: string | null;
	tagline: string | null;
	tier: string;
	tier_detail: string;
	billing_interval: string;
	price_amount: number;
	currency_code: string;
	trial_days: number;
	ai_credits_monthly: number;
	integration_credits_monthly: number;
	feature_highlights: string[] | null;
	is_active: boolean;
	sort_order: number;
	last_synced_at: string | null;
}

interface PlansResponse { data: Plan[] }

export default function PlansEditorialPage() {
	const { mutate } = useSWRConfig();
	const { data } = useSWR<PlansResponse>(['/api/admin/subscription-plans']);
	const [editing, setEditing] = useState<Plan | null>(null);

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/admin/subscription-plans');
	const rows = data?.data ?? [];

	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div className="co-stat-label" style={{ marginBottom: 6 }}>Pricing page · editorial only</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>Subscription plans</h1>
				<p style={{ fontSize: 14, color: 'var(--fg-2)', marginTop: 6, maxWidth: 720 }}>
					Edit marketing copy and credit allocations. Stripe-linked fields (price, currency, billing interval, tier) are managed via <code style={{ background: 'var(--bg-2)', padding: '0 4px' }}>npm run seed:plans:from-stripe</code>.
				</p>
			</div>

			{editing && <EditModal plan={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); }} />}

			<div style={{ display: 'grid', gap: 12 }}>
				{rows.length === 0 && <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)' }}>No plans synced yet — run the Stripe sync.</div>}
				{rows.map((p) => (
					<div key={p.id} className="card" style={{ padding: 'var(--space-4)' }}>
						<div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
							<div>
								<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
									<div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
									<span className="chip">{p.tier}</span>
									<span className="chip">{p.billing_interval}</span>
									{!p.is_active && <span className="chip" style={{ color: 'var(--accent)' }}>inactive</span>}
								</div>
								{p.tagline && <div style={{ fontSize: 13, color: 'var(--fg-2)', marginTop: 4 }}>{p.tagline}</div>}
							</div>
							<button className="btn" onClick={() => setEditing(p)}>Edit editorial</button>
						</div>
						<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 12, fontSize: 12 }}>
							<Stat label="Price" value={`${(p.price_amount / 100).toFixed(2)} ${p.currency_code}`} />
							<Stat label="AI credits / mo" value={p.ai_credits_monthly} />
							<Stat label="Integration credits / mo" value={p.integration_credits_monthly} />
							<Stat label="Stripe price" value={<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.stripe_price_id.slice(0, 14)}…</span>} />
						</div>
						{p.feature_highlights && p.feature_highlights.length > 0 && (
							<div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
								<div className="co-stat-label" style={{ marginBottom: 4 }}>Feature highlights</div>
								<ul style={{ paddingLeft: 20, margin: 0, fontSize: 13 }}>
									{p.feature_highlights.map((f, i) => <li key={i}>{f}</li>)}
								</ul>
							</div>
						)}
					</div>
				))}
			</div>
		</div>
	);
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div>
			<div className="co-stat-label">{label}</div>
			<div style={{ fontWeight: 700, fontSize: 13 }}>{value}</div>
		</div>
	);
}

function EditModal({ plan, onClose, onSaved }: { plan: Plan; onClose: () => void; onSaved: () => void }) {
	const [name, setName] = useState(plan.name);
	const [tagline, setTagline] = useState(plan.tagline ?? '');
	const [description, setDescription] = useState(plan.description ?? '');
	const [highlights, setHighlights] = useState((plan.feature_highlights ?? []).join('\n'));
	const [aiCredits, setAiCredits] = useState<string>(String(plan.ai_credits_monthly));
	const [intCredits, setIntCredits] = useState<string>(String(plan.integration_credits_monthly));
	const [isActive, setIsActive] = useState(plan.is_active);
	const [sortOrder, setSortOrder] = useState<string>(String(plan.sort_order));
	const [pending, setPending] = useState(false);

	const submit = async () => {
		setPending(true);
		try {
			await api('PATCH', `/api/admin/subscription-plans/${plan.id}`, {
				name: name.trim(),
				tagline: tagline.trim() || null,
				description: description.trim() || null,
				feature_highlights: highlights.split('\n').map((s) => s.trim()).filter(Boolean),
				ai_credits_monthly: Number(aiCredits) || 0,
				integration_credits_monthly: Number(intCredits) || 0,
				is_active: isActive,
				sort_order: Number(sortOrder) || 0,
			});
			toast.success('Saved');
			onSaved();
		} catch (e) { toast.error((e as Error).message); }
		finally { setPending(false); }
	};

	return (
		<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 100 }} onClick={onClose}>
			<div className="card" style={{ width: 'min(640px, 92vw)', padding: 'var(--space-4)', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
				<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
					<div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>Edit {plan.tier} · {plan.billing_interval}</div>
					<button className="btn ghost" onClick={onClose}><X size={12} /></button>
				</div>
				<div style={{ display: 'grid', gap: 12 }}>
					<Field label="Name"><input className="search-input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
					<Field label="Tagline"><input className="search-input" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Short marketing one-liner" /></Field>
					<Field label="Description"><textarea className="search-input" style={{ minHeight: 80 }} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
					<Field label="Feature highlights (one per line)"><textarea className="search-input" style={{ minHeight: 120 }} value={highlights} onChange={(e) => setHighlights(e.target.value)} /></Field>
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12 }}>
						<Field label="AI credits / mo"><input className="search-input" type="number" value={aiCredits} onChange={(e) => setAiCredits(e.target.value)} /></Field>
						<Field label="Integration credits / mo"><input className="search-input" type="number" value={intCredits} onChange={(e) => setIntCredits(e.target.value)} /></Field>
						<Field label="Sort"><input className="search-input" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></Field>
					</div>
					<label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
						<input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active (show on pricing page)
					</label>
				</div>
				<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={!name.trim() || pending} onClick={() => void submit()}>
						<Save size={12} /> {pending ? 'Saving…' : 'Save'}
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
