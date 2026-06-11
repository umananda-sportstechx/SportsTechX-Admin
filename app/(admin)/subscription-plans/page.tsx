'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState } from '@/components/atoms';

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
	allows_overage_billing?: boolean;
	ai_overage_price_cents?: number | null;
	integration_overage_price_cents?: number | null;
	is_active: boolean;
	sort_order: number;
	last_synced_at: string | null;
}

interface PlansResponse { data: Plan[] }

export default function PlansEditorialPage() {
	const { mutate } = useSWRConfig();
	const { data, error, isLoading } = useSWR<PlansResponse>(['/api/admin/subscription-plans']);
	const [editing, setEditing] = useState<Plan | null>(null);
	const [creating, setCreating] = useState(false);

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/admin/subscription-plans');
	const archive = async (p: Plan) => {
		if (!confirm(`Archive "${p.name}"? It stays for existing subscribers but can't be newly subscribed to (Stripe price + product archived).`)) return;
		try { await api('DELETE', `/api/admin/subscription-plans/${p.id}`); toast.success('Plan archived'); void refresh(); }
		catch (e) { toast.error((e as Error).message); }
	};
	const rows = data?.data ?? [];

	return (
		<div>
			<PageHeader
				kicker="Pricing page"
				title="Subscription plans"
				subtitle="Create a plan (provisions a Stripe product + price), or edit marketing copy, credits, trial length, and overage pricing. Stripe price/currency/interval are immutable once created — to change pricing, deactivate and create a new plan."
				action={<button className="btn" onClick={() => setCreating(true)}>New plan</button>}
			/>

			{creating && <CreateModal onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void refresh(); }} />}
			{editing && <EditModal plan={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void refresh(); }} />}

			<AsyncState loading={isLoading} error={error} empty={rows.length === 0} emptyMsg="No plans yet — create one or run the Stripe sync." onRetry={() => void refresh()}>
			<div style={{ display: 'grid', gap: 12 }}>
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
							<div style={{ display: 'flex', gap: 6 }}>
							<button className="btn" onClick={() => setEditing(p)}>Edit editorial</button>
							{p.is_active !== false && <button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void archive(p)}>Archive</button>}
						</div>
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
			</AsyncState>
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
	const [trialDays, setTrialDays] = useState<string>(String(plan.trial_days));
	const [allowsOverage, setAllowsOverage] = useState<boolean>(!!plan.allows_overage_billing);
	const [aiOverage, setAiOverage] = useState<string>(plan.ai_overage_price_cents != null ? String(plan.ai_overage_price_cents) : '');
	const [intOverage, setIntOverage] = useState<string>(plan.integration_overage_price_cents != null ? String(plan.integration_overage_price_cents) : '');
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
				trial_days: Number(trialDays) || 0,
				ai_credits_monthly: Number(aiCredits) || 0,
				integration_credits_monthly: Number(intCredits) || 0,
				allows_overage_billing: allowsOverage,
				ai_overage_price_cents: aiOverage === '' ? null : Number(aiOverage),
				integration_overage_price_cents: intOverage === '' ? null : Number(intOverage),
				is_active: isActive,
				sort_order: Number(sortOrder) || 0,
			});
			toast.success('Saved');
			onSaved();
		} catch (e) { toast.error((e as Error).message); }
		finally { setPending(false); }
	};

	return (
		<Modal
			title={`Edit ${plan.tier} · ${plan.billing_interval}`}
			onClose={onClose}
			width={640}
			footer={
				<>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={!name.trim() || pending} onClick={() => void submit()}>
						<Save size={12} /> {pending ? 'Saving…' : 'Save'}
					</button>
				</>
			}
		>
			<div style={{ display: 'grid', gap: 12 }}>
				<Field label="Name"><input className="search-input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
				<Field label="Tagline"><input className="search-input" value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder="Short marketing one-liner" /></Field>
				<Field label="Description"><textarea className="search-input" style={{ minHeight: 80 }} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
				<Field label="Feature highlights (one per line)"><textarea className="search-input" style={{ minHeight: 120 }} value={highlights} onChange={(e) => setHighlights(e.target.value)} /></Field>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 100px', gap: 12 }}>
					<Field label="AI credits / mo"><input className="search-input" type="number" value={aiCredits} onChange={(e) => setAiCredits(e.target.value)} /></Field>
					<Field label="Integration credits / mo"><input className="search-input" type="number" value={intCredits} onChange={(e) => setIntCredits(e.target.value)} /></Field>
					<Field label="Trial days"><input className="search-input" type="number" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} /></Field>
					<Field label="Sort"><input className="search-input" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></Field>
				</div>
				<label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
					<input type="checkbox" checked={allowsOverage} onChange={(e) => setAllowsOverage(e.target.checked)} /> Allow overage billing
				</label>
				{allowsOverage && (
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
						<Field label="AI overage (cents / credit)"><input className="search-input" type="number" value={aiOverage} onChange={(e) => setAiOverage(e.target.value)} /></Field>
						<Field label="Integration overage (cents / credit)"><input className="search-input" type="number" value={intOverage} onChange={(e) => setIntOverage(e.target.value)} /></Field>
					</div>
				)}
				<label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
					<input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active (show on pricing page)
				</label>
			</div>
		</Modal>
	);
}

function CreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
	const [slug, setSlug] = useState('');
	const [name, setName] = useState('');
	const [tagline, setTagline] = useState('');
	const [description, setDescription] = useState('');
	const [tier, setTier] = useState<'free' | 'growth' | 'pro'>('growth');
	const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('yearly');
	const [priceAmount, setPriceAmount] = useState('0'); // cents
	const [currency, setCurrency] = useState('EUR');
	const [trialDays, setTrialDays] = useState('0');
	const [aiCredits, setAiCredits] = useState('0');
	const [intCredits, setIntCredits] = useState('0');
	const [highlights, setHighlights] = useState('');
	const [sortOrder, setSortOrder] = useState('0');
	const [pending, setPending] = useState(false);

	// tier_detail is derived from tier + interval (matches the server enum).
	const tierDetail = tier === 'free' ? 'free' : `${tier}_${billingInterval}`;

	const submit = async () => {
		setPending(true);
		try {
			await api('POST', '/api/admin/subscription-plans', {
				slug: slug.trim(),
				name: name.trim(),
				tagline: tagline.trim() || null,
				description: description.trim() || null,
				tier,
				tier_detail: tierDetail,
				billing_interval: billingInterval,
				price_amount: Number(priceAmount) || 0,
				currency_code: currency.trim().toUpperCase() || 'EUR',
				trial_days: Number(trialDays) || 0,
				ai_credits_monthly: Number(aiCredits) || 0,
				integration_credits_monthly: Number(intCredits) || 0,
				feature_highlights: highlights.split('\n').map((s) => s.trim()).filter(Boolean),
				is_active: true,
				sort_order: Number(sortOrder) || 0,
			});
			toast.success('Plan created (Stripe product + price provisioned)');
			onSaved();
		} catch (e) { toast.error((e as Error).message); }
		finally { setPending(false); }
	};

	return (
		<Modal
			title="New plan"
			onClose={onClose}
			width={640}
			footer={
				<>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={!slug.trim() || !name.trim() || pending} onClick={() => void submit()}>
						<Save size={12} /> {pending ? 'Creating…' : 'Create plan'}
					</button>
				</>
			}
		>
			<div style={{ display: 'grid', gap: 12 }}>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
					<Field label="Slug (lowercase, dashes)"><input className="search-input" style={{ fontFamily: 'var(--font-mono)' }} value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="growth-yearly" /></Field>
					<Field label="Name"><input className="search-input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
				</div>
				<Field label="Tagline"><input className="search-input" value={tagline} onChange={(e) => setTagline(e.target.value)} /></Field>
				<Field label="Description"><textarea className="search-input" style={{ minHeight: 60 }} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
					<Field label="Tier">
						<select className="search-input" value={tier} onChange={(e) => setTier(e.target.value as 'free' | 'growth' | 'pro')}>
							<option value="free">free</option>
							<option value="growth">growth</option>
							<option value="pro">pro</option>
						</select>
					</Field>
					<Field label="Billing interval">
						<select className="search-input" value={billingInterval} onChange={(e) => setBillingInterval(e.target.value as 'monthly' | 'yearly')}>
							<option value="monthly">monthly</option>
							<option value="yearly">yearly</option>
						</select>
					</Field>
				</div>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 12 }}>
					<Field label="Price (cents)"><input className="search-input" type="number" value={priceAmount} onChange={(e) => setPriceAmount(e.target.value)} /></Field>
					<Field label="Currency"><input className="search-input" value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} /></Field>
					<Field label="Trial days"><input className="search-input" type="number" value={trialDays} onChange={(e) => setTrialDays(e.target.value)} /></Field>
				</div>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 12 }}>
					<Field label="AI credits / mo"><input className="search-input" type="number" value={aiCredits} onChange={(e) => setAiCredits(e.target.value)} /></Field>
					<Field label="Integration credits / mo"><input className="search-input" type="number" value={intCredits} onChange={(e) => setIntCredits(e.target.value)} /></Field>
					<Field label="Sort"><input className="search-input" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></Field>
				</div>
				<Field label="Feature highlights (one per line)"><textarea className="search-input" style={{ minHeight: 100 }} value={highlights} onChange={(e) => setHighlights(e.target.value)} /></Field>
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
