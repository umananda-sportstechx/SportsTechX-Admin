'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import useSWRInfinite from 'swr/infinite';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Section, PillTabs } from '@/components/atoms';

/** Minimal user shape the manage panel needs. */
export interface ManageUser { id: string; user_type: string | null }

interface GrantRow {
	id: string;
	feature_slug: string;
	expires_at: string | null;
	revoked_at: string | null;
	reason: string | null;
	created_at: string;
}
interface FeatureCatalogRow { id: string; slug: string; name: string }

const MANAGE_TABS = ['Access', 'Billing & credits', 'Personalization'] as const;
type ManageTab = (typeof MANAGE_TABS)[number];

/**
 * Per-user management panel — used both inline-expanded in the list and on the
 * standalone /users/[id] details page. Grouped into focused tabs.
 */
export function ManagePanel({ user }: { user: ManageUser }) {
	const [tab, setTab] = useState<ManageTab>('Access');
	return (
		<div style={{ display: 'grid', gap: 'var(--space-4)' }}>
			<PillTabs tabs={MANAGE_TABS} value={tab} onChange={setTab} />

			{tab === 'Access' && (
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)' }}>
					<TierChangeSection user={user} />
					<GrantAccessSection profileId={user.id} />
					<FeatureGrantsSection profileId={user.id} />
				</div>
			)}

			{tab === 'Billing & credits' && (
				<div style={{ display: 'grid', gap: 'var(--space-4)' }}>
					<CreditBalancesSection profileId={user.id} />
					<CreditLedgerSection profileId={user.id} />
					<BillingSection profileId={user.id} />
					<CreditGrantSection profileId={user.id} />
				</div>
			)}

			{tab === 'Personalization' && <PersonalizationSection profileId={user.id} />}
		</div>
	);
}

interface AdminCreditPool { monthly_balance: number; topup_balance: number; total_available: number; monthly_grant: number }
interface AdminCredits { ai: AdminCreditPool; integration: AdminCreditPool }

/** Live credit balances for both pools — so admins can SEE what a user has. */
function CreditBalancesSection({ profileId }: { profileId: string }) {
	const { data, isLoading } = useSWR<AdminCredits>([`/api/admin/users/${profileId}/credits`], { dedupingInterval: 15_000 });
	const pool = (label: string, p?: AdminCreditPool) => (
		<div className="card" style={{ padding: 'var(--space-4)' }}>
			<div className="co-stat-label">{label}</div>
			<div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, lineHeight: 1.1, marginTop: 4 }}>
				{isLoading ? '…' : (p?.total_available ?? 0).toLocaleString()}
			</div>
			<div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 6 }}>
				{(p?.monthly_balance ?? 0).toLocaleString()} / {(p?.monthly_grant ?? 0).toLocaleString()} monthly
				{(p?.topup_balance ?? 0) > 0 ? ` · +${(p!.topup_balance).toLocaleString()} top-up` : ''}
			</div>
		</div>
	);
	return (
		<Section title="Credit balances" meta="live · AI + export (integration) pools">
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
				{pool('AI credits', data?.ai)}
				{pool('Export credits', data?.integration)}
			</div>
		</Section>
	);
}

interface AdminLedgerRow {
	id: string; credit_type: string; transaction_type: string; amount: number; balance_after: number;
	description: string | null; operation_key: string | null; display_name: string | null; occurred_at: string;
}
interface AdminLedgerPage { data: AdminLedgerRow[]; nextCursor: string | null }

const LEDGER_TXN_LABEL: Record<string, string> = {
	monthly_grant: 'Monthly grant', topup_purchase: 'Top-up', refund: 'Refund',
	expiry: 'Expired', adjustment: 'Adjustment', spend: 'Usage',
};
function ledgerLabel(r: AdminLedgerRow): string {
	const d = r.description?.trim();
	if (d && /\s/.test(d)) return d;
	if (r.display_name) return r.display_name;
	if (d) return d.replace(/^ai\./, '').replace(/[._]/g, ' ');
	return LEDGER_TXN_LABEL[r.transaction_type] ?? r.transaction_type;
}
function fmtLedgerWhen(iso: string): string {
	const dt = new Date(iso);
	return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
const LEDGER_FILTERS: Array<{ k: 'all' | 'ai' | 'integration'; label: string }> = [
	{ k: 'all', label: 'All' }, { k: 'ai', label: 'AI' }, { k: 'integration', label: 'Export' },
];

/** Itemized credit-spend history for this user (every spend, grant & refund). */
function CreditLedgerSection({ profileId }: { profileId: string }) {
	const [type, setType] = useState<'all' | 'ai' | 'integration'>('all');
	const getKey = (index: number, prev: AdminLedgerPage | null) => {
		if (prev && !prev.nextCursor) return null;
		const cursor = index === 0 ? undefined : (prev?.nextCursor ?? undefined);
		return [`/api/admin/users/${profileId}/ledger`, { type, cursor, limit: 25 }];
	};
	const { data, size, setSize, isLoading, isValidating } = useSWRInfinite<AdminLedgerPage>(getKey, { revalidateFirstPage: false });
	useEffect(() => { setSize(1); }, [type, setSize]);
	const rows = data ? data.flatMap((p) => p.data) : [];
	const hasMore = Boolean(data?.[data.length - 1]?.nextCursor);
	const loadingMore = isValidating && size > (data?.length ?? 0);

	return (
		<Section
			title="Credit activity"
			meta="every spend, grant & refund"
			action={
				<div style={{ display: 'flex', gap: 4 }}>
					{LEDGER_FILTERS.map((f) => (
						<button
							key={f.k}
							className="btn ghost"
							style={{ height: 26, padding: '0 10px', fontSize: 12, borderBottom: type === f.k ? '2px solid var(--accent)' : '2px solid transparent', color: type === f.k ? 'var(--fg)' : 'var(--fg-muted)' }}
							onClick={() => setType(f.k)}
						>
							{f.label}
						</button>
					))}
				</div>
			}
		>
			{isLoading && rows.length === 0 ? (
				<div style={{ padding: 16, color: 'var(--fg-muted)', fontSize: 13 }}>Loading…</div>
			) : rows.length === 0 ? (
				<div style={{ padding: 16, color: 'var(--fg-muted)', fontSize: 13 }}>No credit activity.</div>
			) : (
				<div className="table-scroll">
					<table className="data-table">
						<thead>
							<tr>
								<th>When</th><th>Pool</th><th>Activity</th>
								<th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Balance</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((r) => {
								const spend = r.amount < 0;
								return (
									<tr key={r.id}>
										<td style={{ whiteSpace: 'nowrap', color: 'var(--fg-muted)', fontSize: 12 }}>{fmtLedgerWhen(r.occurred_at)}</td>
										<td>{r.credit_type === 'ai' ? 'AI' : 'Export'}</td>
										<td>{ledgerLabel(r)}{r.transaction_type !== 'spend' ? ` (${LEDGER_TXN_LABEL[r.transaction_type] ?? r.transaction_type})` : ''}</td>
										<td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700, color: spend ? 'var(--neg)' : 'var(--pos)' }}>{spend ? '' : '+'}{r.amount.toLocaleString()}</td>
										<td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}>{r.balance_after.toLocaleString()}</td>
									</tr>
								);
							})}
						</tbody>
					</table>
					{hasMore && (
						<div style={{ display: 'flex', justifyContent: 'center', padding: 12 }}>
							<button className="btn ghost" disabled={loadingMore} onClick={() => setSize(size + 1)}>{loadingMore ? 'Loading…' : 'Load more'}</button>
						</div>
					)}
				</div>
			)}
		</Section>
	);
}

/** Grant extra non-expiring credits (AI or integration/export) to this user. */
function CreditGrantSection({ profileId }: { profileId: string }) {
	const [amount, setAmount] = useState('');
	const [type, setType] = useState<'ai' | 'integration'>('ai');
	const [pending, setPending] = useState(false);
	const { mutate } = useSWRConfig();
	const grant = async () => {
		const n = Number(amount);
		if (!Number.isFinite(n) || n < 1) { toast.error('Enter a positive amount'); return; }
		setPending(true);
		try {
			await api('POST', '/api/admin/billing/bulk-credit-grant', { profile_ids: [profileId], credits: Math.floor(n), credit_type: type });
			toast.success(`Granted ${Math.floor(n).toLocaleString()} ${type === 'ai' ? 'AI' : 'export'} credits`);
			setAmount('');
			void mutate([`/api/admin/users/${profileId}/credits`]);
		} catch (e) { toast.error((e as Error).message); }
		finally { setPending(false); }
	};
	return (
		<Section title="Grant credits" meta="non-expiring top-up · used after monthly plan credits">
			<div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
				<select className="search-input" style={{ height: 32, width: 180 }} value={type} onChange={(e) => setType(e.target.value as 'ai' | 'integration')}>
					<option value="ai">AI credits</option>
					<option value="integration">Integration / export credits</option>
				</select>
				<input className="search-input" type="number" min="1" step="1" style={{ height: 32, width: 140 }} placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
				<button className="btn" disabled={pending} onClick={() => void grant()}>Grant</button>
			</div>
		</Section>
	);
}

interface PersonalizationProfile {
	interests: { sectors: string[]; sports: string[]; regions: string[]; topics: string[]; tech_tags: string[]; intents: string[]; entity_interests: string[] };
	summary: string | null;
	metrics: { engagement_level: string; chat_signals: number; search_signals: number; total_signals: number; top_terms: Array<{ term: string; count: number }>; last_signal_at: string | null };
	last_analyzed_at: string | null;
}

function PersonalizationSection({ profileId }: { profileId: string }) {
	const { data, isLoading } = useSWR<{ profile: PersonalizationProfile | null }>(
		[`/api/admin/users/${profileId}/personalization`], { dedupingInterval: 30_000 },
	);
	const p = data?.profile;
	const chips = (label: string, items: string[]) => items.length > 0 && (
		<div style={{ marginBottom: 6 }}>
			<span style={{ fontSize: 11, color: 'var(--fg-muted)', marginRight: 6 }}>{label}</span>
			{items.map((t) => <span key={t} className="chip" style={{ marginRight: 4 }}>{t}</span>)}
		</div>
	);
	return (
		<Section title="Personalization" meta="AI-derived interests + metrics · read-only">
			{isLoading ? <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>Loading…</div>
				: !p ? <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>No personalization yet — builds as the user uses chat + search.</div>
				: (
					<div>
						{p.summary && <p style={{ fontSize: 13, color: 'var(--fg-2)', margin: '0 0 10px' }}>{p.summary}</p>}
						{chips('Sectors', p.interests.sectors)}
						{chips('Sports', p.interests.sports)}
						{chips('Topics', p.interests.topics)}
						{chips('Tech', p.interests.tech_tags)}
						{chips('Regions', p.interests.regions)}
						{chips('Intents', p.interests.intents)}
						{chips('Entities', p.interests.entity_interests)}
						<div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12, color: 'var(--fg-muted)' }}>
							<span>Engagement: <b style={{ color: 'var(--fg-2)' }}>{p.metrics.engagement_level}</b></span>
							<span>Signals: {p.metrics.total_signals} ({p.metrics.chat_signals} chat / {p.metrics.search_signals} search)</span>
							{p.metrics.last_signal_at && <span>Last: {new Date(p.metrics.last_signal_at).toLocaleDateString()}</span>}
						</div>
						{p.metrics.top_terms.length > 0 && (
							<div style={{ marginTop: 8 }}>
								<span style={{ fontSize: 11, color: 'var(--fg-muted)', marginRight: 6 }}>Top terms</span>
								{p.metrics.top_terms.map((t) => <span key={t.term} className="chip" style={{ marginRight: 4 }}>{t.term} · {t.count}</span>)}
							</div>
						)}
					</div>
				)}
		</Section>
	);
}

interface BillingDetail {
	local: {
		stripe_customer_id: string | null; stripe_subscription_id: string | null;
		active_subscription: boolean; is_trial: boolean; trial_ends_at: string | null;
		expires_at: string | null; subscription_started_at: string | null;
	} | null;
	stripe: {
		status?: string; cancel_at_period_end?: boolean; current_period_end?: string | null;
		has_scheduled_change?: boolean; price_nickname?: string | null; amount?: number | null;
		currency?: string | null; interval?: string | null; error?: string;
	} | null;
}

function BillingSection({ profileId }: { profileId: string }) {
	const { data, isLoading } = useSWR<BillingDetail>([`/api/admin/users/${profileId}/billing`], { dedupingInterval: 30_000 });
	const l = data?.local; const s = data?.stripe;
	const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString() : '—');
	const cell = (label: string, value: ReactNode) => (
		<div><div className="co-stat-label">{label}</div><div style={{ fontSize: 13 }}>{value}</div></div>
	);
	const pending = s?.cancel_at_period_end ? 'Cancels at period end' : s?.has_scheduled_change ? 'Plan change scheduled' : '—';
	return (
		<div className="card" style={{ padding: 'var(--space-4)' }}>
			<div className="co-stat-label" style={{ marginBottom: 10 }}>Billing</div>
			{isLoading ? (
				<div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Loading…</div>
			) : !l ? (
				<div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>No subscription record.</div>
			) : (
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
					{cell('Plan status', l.active_subscription ? (l.is_trial ? 'Trial' : 'Active') : 'Inactive')}
					{cell('Renews / expires', fmt(s?.current_period_end ?? l.expires_at))}
					{cell('Trial ends', fmt(l.trial_ends_at))}
					{cell('Pending change', <span style={{ color: pending === '—' ? 'var(--fg)' : 'var(--accent)', fontWeight: pending === '—' ? 400 : 600 }}>{pending}</span>)}
					{cell('Stripe plan', s?.price_nickname ?? (s?.amount != null ? `${s.amount} ${(s.currency ?? '').toUpperCase()}/${s.interval ?? ''}` : '—'))}
					{cell('Stripe status', s?.status ?? '—')}
					{cell('Customer ID', <code style={{ fontSize: 11 }}>{l.stripe_customer_id ?? '—'}</code>)}
					{cell('Subscription ID', <code style={{ fontSize: 11 }}>{l.stripe_subscription_id ?? '—'}</code>)}
				</div>
			)}
			{s?.error && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 8 }}>Stripe lookup: {s.error}</div>}
		</div>
	);
}

function TierChangeSection({ user }: { user: ManageUser }) {
	const { mutate } = useSWRConfig();
	const [tier, setTier] = useState(user.user_type ?? 'free');
	const [pending, setPending] = useState(false);
	const update = async () => {
		setPending(true);
		try {
			await api('PATCH', `/api/admin/users/${user.id}`, { user_type: tier });
			toast.success('Tier updated');
			void mutate((key) => Array.isArray(key) && key[0] === '/api/admin/users');
		} catch (e) { toast.error((e as Error).message); }
		finally { setPending(false); }
	};
	return (
		<div>
			<div className="co-stat-label" style={{ marginBottom: 8 }}>Permanent tier</div>
			<select className="search-input" style={{ width: '100%', marginBottom: 8 }} value={tier} onChange={(e) => setTier(e.target.value)}>
				{['free', 'growth', 'pro'].map((t) => <option key={t} value={t}>{t}</option>)}
			</select>
			<button className="btn" disabled={pending || tier === user.user_type} onClick={() => void update()}>
				{pending ? 'Saving…' : 'Save tier'}
			</button>
		</div>
	);
}

function GrantAccessSection({ profileId }: { profileId: string }) {
	const { mutate } = useSWRConfig();
	const [tier, setTier] = useState<'growth' | 'pro'>('pro');
	const [days, setDays] = useState(30);
	const [reason, setReason] = useState('');
	const [pending, setPending] = useState(false);
	const grant = async () => {
		setPending(true);
		try {
			await api('POST', '/api/admin/billing/grant-access', { profile_id: profileId, tier, days, reason: reason.trim() || undefined });
			toast.success(`Granted ${tier} for ${days} day${days === 1 ? '' : 's'}`);
			setReason('');
			void mutate((key) => Array.isArray(key) && key[0] === '/api/admin/users');
		} catch (e) { toast.error((e as Error).message); }
		finally { setPending(false); }
	};
	return (
		<div>
			<div className="co-stat-label" style={{ marginBottom: 8 }}>Grant time-bounded access</div>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 6, marginBottom: 6 }}>
				<select className="search-input" value={tier} onChange={(e) => setTier(e.target.value as 'growth' | 'pro')}>
					<option value="growth">Growth</option>
					<option value="pro">Pro</option>
				</select>
				<input className="search-input" type="number" min={1} max={3650} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))} />
			</div>
			<input className="search-input" placeholder="Reason (optional)" style={{ width: '100%', marginBottom: 8 }} value={reason} onChange={(e) => setReason(e.target.value)} />
			<button className="btn" disabled={pending} onClick={() => void grant()}>
				{pending ? 'Granting…' : `Grant ${tier} · ${days}d`}
			</button>
		</div>
	);
}

function FeatureGrantsSection({ profileId }: { profileId: string }) {
	const { mutate } = useSWRConfig();
	const [slug, setSlug] = useState('');
	const [days, setDays] = useState<number | ''>(30);
	const [reason, setReason] = useState('');
	const [addPending, setAddPending] = useState(false);
	const [revokePending, setRevokePending] = useState(false);

	const { data: catalog } = useSWR<{ data: FeatureCatalogRow[] }>(['/api/admin/features'], { dedupingInterval: 5 * 60_000 });
	const featureOptions = catalog?.data ?? [];

	const { data } = useSWR<{ data: GrantRow[] }>([`/api/admin/users/${profileId}/feature-grants`], { dedupingInterval: 30_000 });
	const grants = data?.data ?? [];
	const activeGrants = grants.filter((g) => !g.revoked_at && (!g.expires_at || new Date(g.expires_at) > new Date()));
	const refreshGrants = () => mutate([`/api/admin/users/${profileId}/feature-grants`]);

	const add = async () => {
		setAddPending(true);
		try {
			await api('POST', `/api/admin/users/${profileId}/feature-grants`, {
				feature_slug: slug,
				days: days === '' ? undefined : Number(days),
				expires_at: days === '' ? null : undefined,
				reason: reason.trim() || undefined,
			});
			toast.success(`Granted ${slug}`);
			setReason('');
			void refreshGrants();
		} catch (e) { toast.error((e as Error).message); }
		finally { setAddPending(false); }
	};
	const revoke = async (s: string) => {
		setRevokePending(true);
		try {
			await api('DELETE', `/api/admin/users/${profileId}/feature-grants/${s}`);
			toast.success('Revoked');
			void refreshGrants();
		} catch (e) { toast.error((e as Error).message); }
		finally { setRevokePending(false); }
	};

	return (
		<div>
			<div className="co-stat-label" style={{ marginBottom: 8 }}>Per-feature grants</div>
			{activeGrants.length === 0 ? (
				<div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 10 }}>None active.</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
					{activeGrants.map((g) => (
						<div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, background: 'var(--bg-1)', padding: '4px 8px', border: '1px solid var(--border)' }}>
							<span style={{ fontFamily: 'var(--font-mono)', flex: 1 }}>{g.feature_slug}</span>
							<span style={{ color: 'var(--fg-muted)' }}>{g.expires_at ? `expires ${new Date(g.expires_at).toLocaleDateString()}` : 'permanent'}</span>
							<button className="btn ghost" style={{ padding: '2px 8px', fontSize: 11 }} disabled={revokePending} onClick={() => void revoke(g.feature_slug)}>Revoke</button>
						</div>
					))}
				</div>
			)}
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 6, marginBottom: 6 }}>
				<select className="search-input" value={slug} onChange={(e) => setSlug(e.target.value)}>
					<option value="">Select feature…</option>
					{featureOptions.map((f) => <option key={f.id} value={f.slug}>{f.name}</option>)}
				</select>
				<input className="search-input" type="number" min={0} placeholder="days" value={days} onChange={(e) => {
					const v = e.target.value;
					if (v === '') { setDays(''); return; }
					const n = Number(v); setDays(Number.isFinite(n) && n > 0 ? n : '');
				}} />
			</div>
			<input className="search-input" placeholder="Reason (optional)" style={{ width: '100%', marginBottom: 8 }} value={reason} onChange={(e) => setReason(e.target.value)} />
			<button className="btn" disabled={addPending || !slug} onClick={() => void add()}>
				{addPending ? 'Granting…' : slug ? `Grant ${slug}${days === '' ? ' (permanent)' : ` · ${days}d`}` : 'Grant feature'}
			</button>
		</div>
	);
}
