'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { CalendarPlus, Coins, KeyRound, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { UserSelectOne, UserMultiPicker } from '@/components/entity-pickers';

interface TrialGrantResponse {
	id: string;
	is_trial: boolean;
	trial_ends_at: string | null;
}

interface BulkCreditResponse {
	granted: number;
}

interface BulkGrantAccessResponse {
	results: Array<{ email: string; success: boolean; profile_id?: string; error?: string }>;
	summary: { total: number; succeeded: number; failed: number };
}

/**
 * Admin billing tools.
 *
 * Two operations exposed by the server:
 *   - POST /api/admin/billing/grant-trial      { profile_id, days }
 *   - POST /api/admin/billing/bulk-credit-grant{ profile_ids[], credits, credit_type, reason? }
 *
 * Trial grants extend (or start) a per-user free trial window. Bulk credit
 * grants drop AI or integration credits straight into the user's ledger so
 * the existing CreditsService balance queries pick them up automatically.
 */
export default function BillingAdminPage() {
	const [trialProfile, setTrialProfile] = useState('');
	const [trialDays, setTrialDays] = useState(14);

	const [bulkUsers, setBulkUsers] = useState<string[]>([]);
	const [bulkCredits, setBulkCredits] = useState(50);
	const [bulkType, setBulkType] = useState<'ai' | 'integration'>('ai');
	const [bulkReason, setBulkReason] = useState('');

	// bulk-grant-access — promote a batch of users to a tier without Stripe.
	const [accessEmails, setAccessEmails] = useState('');
	const [accessTier, setAccessTier] = useState<'growth' | 'pro'>('pro');
	const [accessDays, setAccessDays] = useState(30);
	const [accessReason, setAccessReason] = useState('');
	const [accessResults, setAccessResults] = useState<BulkGrantAccessResponse | null>(null);

	const [trialPending, setTrialPending] = useState(false);
	const [creditPending, setCreditPending] = useState(false);
	const [accessPending, setAccessPending] = useState(false);

	const grantTrial = async () => {
		setTrialPending(true);
		try {
			const res = await api<TrialGrantResponse>('POST', '/api/admin/billing/grant-trial', {
				profile_id: trialProfile.trim(),
				days: trialDays,
			});
			const ends = res.trial_ends_at ? new Date(res.trial_ends_at).toLocaleDateString() : 'unknown';
			toast.success(`Trial extended — expires ${ends}`);
			setTrialProfile('');
		} catch (e) {
			toast.error((e as Error).message ?? 'Could not grant trial');
		} finally {
			setTrialPending(false);
		}
	};

	const bulkCredit = async () => {
		setCreditPending(true);
		try {
			const res = await api<BulkCreditResponse>('POST', '/api/admin/billing/bulk-credit-grant', {
				profile_ids: bulkUsers,
				credits: bulkCredits,
				credit_type: bulkType,
				reason: bulkReason || undefined,
			});
			toast.success(`Granted ${bulkCredits} ${bulkType} credit(s) to ${res.granted} user(s)`);
			setBulkUsers([]);
		} catch (e) {
			toast.error((e as Error).message ?? 'Could not grant credits');
		} finally {
			setCreditPending(false);
		}
	};

	const parsedIdCount = bulkUsers.length;

	const parsedEmailCount = accessEmails
		.split(/[\n,;]+/)
		.map((s) => s.trim())
		.filter(Boolean).length;

	const bulkGrantAccess = async () => {
		setAccessPending(true);
		try {
			const emails = accessEmails
				.split(/[\n,;]+/)
				.map((s) => s.trim().toLowerCase())
				.filter(Boolean);
			const res = await api<BulkGrantAccessResponse>('POST', '/api/admin/billing/bulk-grant-access', {
				emails,
				tier: accessTier,
				days: accessDays,
				reason: accessReason.trim() || undefined,
			});
			setAccessResults(res);
			toast.success(`Granted ${res.summary.succeeded}/${res.summary.total} successfully`);
		} catch (e) {
			toast.error((e as Error).message ?? 'Could not grant access');
		} finally {
			setAccessPending(false);
		}
	};

	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div
					style={{
						fontFamily: 'var(--font-mono)',
						fontSize: 11,
						color: 'var(--fg-muted)',
						textTransform: 'uppercase',
						letterSpacing: '0.1em',
						marginBottom: 6,
					}}
				>
					Billing · admin tools
				</div>
				<h1
					style={{
						fontFamily: 'var(--font-display)',
						fontSize: 38,
						fontWeight: 800,
						letterSpacing: '-0.02em',
						lineHeight: 1,
						margin: 0,
					}}
				>
					Trial grants & credit drops
				</h1>
				<p style={{ fontSize: 14, color: 'var(--fg-2)', maxWidth: 720, margin: '6px 0 0' }}>
					Manual interventions for support workflows. Trial extensions update
					<code style={{ background: 'var(--bg-2)', padding: '0 4px' }}>profiles.trial_ends_at</code>;
					bulk credit grants append rows to
					<code style={{ background: 'var(--bg-2)', padding: '0 4px' }}>credit_transactions</code>.
				</p>
			</div>

			<div className="grid-2" style={{ gap: 'var(--space-4)' }}>
				{/* ─── Grant trial ─── */}
				<div className="card" style={{ padding: 'var(--space-4)' }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
						<CalendarPlus size={16} />
						<div style={{ fontWeight: 700, fontSize: 15 }}>Grant trial</div>
					</div>
					<p style={{ fontSize: 13, color: 'var(--fg-2)', marginBottom: 16 }}>
						Extends (or starts) a free trial for one user. New trial end date is
						<b>{` ${trialDays} day${trialDays === 1 ? '' : 's'} `}</b>
						from now (or from the current trial end, whichever is later).
					</p>

					<div style={{ marginBottom: 12 }}>
						<div className="co-stat-label" style={{ marginBottom: 6 }}>User</div>
						<UserSelectOne value={trialProfile} onChange={setTrialProfile} />
					</div>
					<div style={{ marginBottom: 16 }}>
						<div className="co-stat-label" style={{ marginBottom: 6 }}>Trial length (days)</div>
						<input
							className="search-input"
							type="number"
							min={1}
							max={365}
							style={{ width: '100%' }}
							value={trialDays}
							onChange={(e) => setTrialDays(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
						/>
					</div>
					<button
						className="btn"
						disabled={!trialProfile.trim() || trialPending}
						onClick={() => void grantTrial()}
					>
						{trialPending ? 'Granting…' : `Grant ${trialDays}-day trial`}
					</button>
				</div>

				{/* ─── Bulk credit grant ─── */}
				<div className="card" style={{ padding: 'var(--space-4)' }}>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
						<Coins size={16} />
						<div style={{ fontWeight: 700, fontSize: 15 }}>Bulk credit grant</div>
					</div>
					<p style={{ fontSize: 13, color: 'var(--fg-2)', marginBottom: 16 }}>
						Drops the same number of credits into the ledger for each profile ID
						below. Recipients see the balance change instantly via the existing
						<code style={{ background: 'var(--bg-2)', padding: '0 4px' }}>CreditsService</code>.
					</p>

					<div style={{ marginBottom: 12 }}>
						<div
							className="co-stat-label"
							style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}
						>
							<span>Users</span>
							<span style={{ color: 'var(--fg-muted)' }}>{parsedIdCount} selected</span>
						</div>
						<UserMultiPicker value={bulkUsers} onChange={setBulkUsers} />
					</div>
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
						<div>
							<div className="co-stat-label" style={{ marginBottom: 6 }}>Credits / user</div>
							<input
								className="search-input"
								type="number"
								min={1}
								style={{ width: '100%' }}
								value={bulkCredits}
								onChange={(e) => setBulkCredits(Math.max(1, Number(e.target.value) || 1))}
							/>
						</div>
						<div>
							<div className="co-stat-label" style={{ marginBottom: 6 }}>Type</div>
							<div style={{ display: 'flex', gap: 6 }}>
								<button
									type="button"
									className={`chip ${bulkType === 'ai' ? 'on' : ''}`}
									onClick={() => setBulkType('ai')}
								>
									AI
								</button>
								<button
									type="button"
									className={`chip ${bulkType === 'integration' ? 'on' : ''}`}
									onClick={() => setBulkType('integration')}
								>
									Integration
								</button>
							</div>
						</div>
					</div>
					<div style={{ marginBottom: 16 }}>
						<div className="co-stat-label" style={{ marginBottom: 6 }}>Reason (optional, shows in ledger)</div>
						<input
							className="search-input"
							style={{ width: '100%' }}
							placeholder="e.g. apology — sev-2 outage 2026-05-10"
							value={bulkReason}
							onChange={(e) => setBulkReason(e.target.value)}
						/>
					</div>
					<button
						className="btn"
						disabled={parsedIdCount === 0 || creditPending}
						onClick={() => void bulkCredit()}
					>
						{creditPending
							? 'Granting…'
							: `Grant ${bulkCredits} ${bulkType} credit${bulkCredits === 1 ? '' : 's'} × ${parsedIdCount} user${parsedIdCount === 1 ? '' : 's'}`}
					</button>
				</div>
			</div>

			{/* ─── Bulk grant access (NEW) ─── */}
			<div className="card" style={{ padding: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
					<KeyRound size={16} />
					<div style={{ fontWeight: 700, fontSize: 15 }}>Bulk grant access (time-bounded, no Stripe)</div>
				</div>
				<p style={{ fontSize: 13, color: 'var(--fg-2)', marginBottom: 16 }}>
					Time-bounded promotion to Growth or Pro. Sets <code style={{ background: 'var(--bg-2)', padding: '0 4px' }}>profiles.user_type</code>,
					<code style={{ background: 'var(--bg-2)', padding: '0 4px' }}>is_trial=true</code>, and
					<code style={{ background: 'var(--bg-2)', padding: '0 4px' }}>trial_ends_at = now() + N days</code>.
					The nightly trial-expiry job downgrades back to free when the window passes (unless the user paid via Stripe mid-grant).
				</p>

				<div style={{ marginBottom: 12 }}>
					<div
						className="co-stat-label"
						style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}
					>
						<span>Emails (one per line or comma-separated)</span>
						<span style={{ color: 'var(--fg-muted)' }}>{parsedEmailCount} parsed</span>
					</div>
					<textarea
						className="search-input"
						style={{ width: '100%', minHeight: 96, fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
						placeholder={'alice@example.com\nbob@example.com'}
						value={accessEmails}
						onChange={(e) => setAccessEmails(e.target.value)}
					/>
				</div>

				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
					<div>
						<div className="co-stat-label" style={{ marginBottom: 6 }}>Tier</div>
						<div style={{ display: 'flex', gap: 6 }}>
							<button
								type="button"
								className={`chip ${accessTier === 'growth' ? 'on' : ''}`}
								onClick={() => setAccessTier('growth')}
							>
								Growth
							</button>
							<button
								type="button"
								className={`chip ${accessTier === 'pro' ? 'on' : ''}`}
								onClick={() => setAccessTier('pro')}
							>
								Pro
							</button>
						</div>
					</div>
					<div>
						<div className="co-stat-label" style={{ marginBottom: 6 }}>Days</div>
						<input
							className="search-input"
							type="number"
							min={1}
							max={3650}
							style={{ width: '100%' }}
							value={accessDays}
							onChange={(e) => setAccessDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))}
						/>
					</div>
				</div>

				<div style={{ marginBottom: 16 }}>
					<div className="co-stat-label" style={{ marginBottom: 6 }}>Reason (optional)</div>
					<input
						className="search-input"
						style={{ width: '100%' }}
						placeholder="e.g. partner program · Q2 2026"
						value={accessReason}
						onChange={(e) => setAccessReason(e.target.value)}
					/>
				</div>

				<button
					className="btn"
					disabled={parsedEmailCount === 0 || accessPending}
					onClick={() => void bulkGrantAccess()}
				>
					{accessPending
						? 'Granting…'
						: `Grant ${accessTier} for ${accessDays}d × ${parsedEmailCount} user${parsedEmailCount === 1 ? '' : 's'}`}
				</button>

				{accessResults && (
					<div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
						<div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 6 }}>
							{accessResults.summary.succeeded}/{accessResults.summary.total} succeeded · {accessResults.summary.failed} failed
						</div>
						<div style={{ maxHeight: 200, overflow: 'auto', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
							{accessResults.results.map((r, i) => (
								<div
									key={i}
									style={{
										display: 'flex',
										gap: 8,
										padding: '2px 0',
										color: r.success ? 'var(--fg-2)' : 'var(--accent)',
									}}
								>
									<span style={{ width: 16 }}>{r.success ? '✓' : '✗'}</span>
									<span style={{ flex: 1 }}>{r.email}</span>
									<span style={{ color: 'var(--fg-muted)' }}>
										{r.success ? (r.profile_id?.slice(0, 8) ?? '') : (r.error ?? 'failed')}
									</span>
								</div>
							))}
						</div>
					</div>
				)}
			</div>

			<OpsAndFunnel />
		</div>
	);
}

interface Funnel {
	overall: { total: number; ever_trialed: number; paid: number; free_to_trial_pct: number; trial_to_paid_pct: number };
	by_plan: Array<{ tier: string | null; trialing: number; paid: number }>;
}

/** DB-side conversion funnel (per-plan) + ops: manually run the trial-expiry sweep. */
function OpsAndFunnel() {
	const { data, mutate } = useSWR<Funnel>(['/api/admin/billing/conversion-funnel'], { dedupingInterval: 60_000 });
	const [running, setRunning] = useState(false);
	const runSweep = async () => {
		setRunning(true);
		try { await api('POST', '/api/admin/billing/run-trial-expiry'); toast.success('Trial-expiry sweep queued'); }
		catch (e) { toast.error((e as Error).message); } finally { setRunning(false); }
	};
	const o = data?.overall;
	return (
		<div style={{ marginTop: 'var(--space-5)', display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)' }}>
			<div className="card" style={{ padding: 'var(--space-4)' }}>
				<div style={{ fontWeight: 700, marginBottom: 10 }}>Conversion funnel <span style={{ fontWeight: 400, color: 'var(--fg-muted)', fontSize: 12 }}>· DB-side, per plan</span></div>
				<div style={{ display: 'flex', gap: 24, marginBottom: 12, flexWrap: 'wrap' }}>
					<div><div className="co-stat-label">Users</div><div style={{ fontSize: 20, fontWeight: 700 }}>{(o?.total ?? 0).toLocaleString()}</div></div>
					<div><div className="co-stat-label">Free → trial</div><div style={{ fontSize: 20, fontWeight: 700 }}>{(o?.free_to_trial_pct ?? 0).toFixed(1)}%</div></div>
					<div><div className="co-stat-label">Trial → paid</div><div style={{ fontSize: 20, fontWeight: 700 }}>{(o?.trial_to_paid_pct ?? 0).toFixed(1)}%</div></div>
					<div><div className="co-stat-label">Paying</div><div style={{ fontSize: 20, fontWeight: 700 }}>{(o?.paid ?? 0).toLocaleString()}</div></div>
				</div>
				<table className="data-table">
					<thead><tr><th>Plan tier</th><th>Trialing</th><th>Paying</th></tr></thead>
					<tbody>
						{(data?.by_plan ?? []).map((r) => (
							<tr key={r.tier ?? '—'}><td>{r.tier ?? '—'}</td><td className="num">{r.trialing.toLocaleString()}</td><td className="num">{r.paid.toLocaleString()}</td></tr>
						))}
						{(data?.by_plan?.length ?? 0) === 0 && <tr><td colSpan={3} style={{ color: 'var(--fg-muted)' }}>No paid/trial users yet.</td></tr>}
					</tbody>
				</table>
			</div>
			<div className="card" style={{ padding: 'var(--space-4)' }}>
				<div style={{ fontWeight: 700, marginBottom: 10 }}>Ops</div>
				<div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 10 }}>Trials auto-expire hourly. Run the sweep now to immediately downgrade any users whose trial has ended (safety net for missed webhooks).</div>
				<button className="btn" disabled={running} onClick={() => void runSweep()}><RefreshCw size={12} /> {running ? 'Queuing…' : 'Run trial-expiry sweep'}</button>
				<button className="btn ghost" style={{ marginTop: 8 }} onClick={() => void mutate()}>Refresh funnel</button>
			</div>
		</div>
	);
}
