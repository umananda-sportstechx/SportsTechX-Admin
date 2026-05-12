'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarPlus, Coins } from 'lucide-react';
import { api } from '@/lib/api';

interface TrialGrantResponse {
	id: string;
	is_trial: boolean;
	trial_ends_at: string | null;
}

interface BulkCreditResponse {
	granted: number;
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

	const [bulkIds, setBulkIds] = useState('');
	const [bulkCredits, setBulkCredits] = useState(50);
	const [bulkType, setBulkType] = useState<'ai' | 'integration'>('ai');
	const [bulkReason, setBulkReason] = useState('');

	const grantTrial = useMutation({
		mutationFn: () =>
			api<TrialGrantResponse>('POST', '/api/admin/billing/grant-trial', {
				profile_id: trialProfile.trim(),
				days: trialDays,
			}),
		onSuccess: (res) => {
			const ends = res.trial_ends_at ? new Date(res.trial_ends_at).toLocaleDateString() : 'unknown';
			toast.success(`Trial extended — expires ${ends}`);
			setTrialProfile('');
		},
		onError: (e: Error) => toast.error(e.message ?? 'Could not grant trial'),
	});

	const bulkCredit = useMutation({
		mutationFn: () => {
			const profile_ids = bulkIds
				.split(/[\s,]+/)
				.map((s) => s.trim())
				.filter(Boolean);
			return api<BulkCreditResponse>('POST', '/api/admin/billing/bulk-credit-grant', {
				profile_ids,
				credits: bulkCredits,
				credit_type: bulkType,
				reason: bulkReason || undefined,
			});
		},
		onSuccess: (res) => {
			toast.success(`Granted ${bulkCredits} ${bulkType} credit(s) to ${res.granted} user(s)`);
			setBulkIds('');
		},
		onError: (e: Error) => toast.error(e.message ?? 'Could not grant credits'),
	});

	const parsedIdCount = bulkIds
		.split(/[\s,]+/)
		.map((s) => s.trim())
		.filter(Boolean).length;

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
						<div className="co-stat-label" style={{ marginBottom: 6 }}>Profile UUID</div>
						<input
							className="search-input"
							style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12 }}
							placeholder="00000000-0000-0000-0000-000000000000"
							value={trialProfile}
							onChange={(e) => setTrialProfile(e.target.value)}
						/>
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
						disabled={!trialProfile.trim() || grantTrial.isPending}
						onClick={() => grantTrial.mutate()}
					>
						{grantTrial.isPending ? 'Granting…' : `Grant ${trialDays}-day trial`}
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
							<span>Profile UUIDs (one per line)</span>
							<span style={{ color: 'var(--fg-muted)' }}>{parsedIdCount} parsed</span>
						</div>
						<textarea
							className="search-input"
							style={{ width: '100%', minHeight: 96, fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
							placeholder={'aaaaaaaa-...\nbbbbbbbb-...\ncccccccc-...'}
							value={bulkIds}
							onChange={(e) => setBulkIds(e.target.value)}
						/>
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
						disabled={parsedIdCount === 0 || bulkCredit.isPending}
						onClick={() => bulkCredit.mutate()}
					>
						{bulkCredit.isPending
							? 'Granting…'
							: `Grant ${bulkCredits} ${bulkType} credit${bulkCredits === 1 ? '' : 's'} × ${parsedIdCount} user${parsedIdCount === 1 ? '' : 's'}`}
					</button>
				</div>
			</div>
		</div>
	);
}
