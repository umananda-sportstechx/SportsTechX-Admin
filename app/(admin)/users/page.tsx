'use client';

import { Fragment, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface User {
	id: string;
	email: string | null;
	display_name: string | null;
	user_role: string | null;
	user_type: string | null;
	company_name: string | null;
	created_at: string;
	last_seen_at: string | null;
}
interface UsersResponse { data: User[]; total: number; totalPages: number }

interface GrantRow {
	id: string;
	feature_slug: string;
	expires_at: string | null;
	revoked_at: string | null;
	reason: string | null;
	created_at: string;
}

// Mirrors the in-code FEATURE_SLUGS set on the server.
const FEATURE_OPTIONS = [
	'reports_access', 'companies_full', 'deals_full', 'investors_full', 'acquisitions_full',
	'programs_access', 'events_access', 'framework_access', 'newsletter_access',
	'analytics_access', 'csv_export', 'api_access', 'ai_chat',
	'saved_searches', 'watchlists', 'recommendations',
];

export default function UsersAdminPage() {
	const { mutate } = useSWRConfig();
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(1);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [rolePending, setRolePending] = useState<string | null>(null);

	const { data } = useSWR<UsersResponse>(
		['/api/admin/users', { q: search || undefined, page, limit: 30 }],
		{ dedupingInterval: 15_000 },
	);

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/admin/users');

	const promote = async (id: string) => {
		setRolePending(id);
		try {
			await api('POST', `/api/admin/users/${id}/promote`);
			toast.success('User promoted');
			void refresh();
		} catch (e) { toast.error((e as Error).message); }
		finally { setRolePending(null); }
	};
	const demote = async (id: string) => {
		setRolePending(id);
		try {
			await api('POST', `/api/admin/users/${id}/demote`);
			toast.success('User demoted');
			void refresh();
		} catch (e) { toast.error((e as Error).message); }
		finally { setRolePending(null); }
	};

	const users = data?.data ?? [];
	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
					Identity · {(data?.total ?? 0).toLocaleString()} total
				</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>Users</h1>
			</div>

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				<input
					className="search-input"
					style={{ flex: '0 0 320px', height: 32 }}
					placeholder="Search email or name…"
					value={search}
					onChange={(e) => { setSearch(e.target.value); setPage(1); }}
				/>
			</div>

			<div className="card">
				<table className="data-table">
					<thead>
						<tr>
							<th>Email</th>
							<th>Name</th>
							<th>Tier</th>
							<th>Role</th>
							<th>Joined</th>
							<th style={{ textAlign: 'right' }}>Actions</th>
						</tr>
					</thead>
					<tbody>
						{users.map((u) => (
							<Fragment key={u.id}>
								<tr>
									<td>{u.email}</td>
									<td>{u.display_name ?? '—'}</td>
									<td><span className="tag">{u.user_type ?? 'free'}</span></td>
									<td>{u.user_role === 'admin' ? <span className="tag pos">admin</span> : 'user'}</td>
									<td className="num">{new Date(u.created_at).toLocaleDateString()}</td>
									<td style={{ textAlign: 'right' }}>
										<div style={{ display: 'inline-flex', gap: 6 }}>
											{u.user_role === 'admin' ? (
												<button className="btn ghost" disabled={rolePending === u.id} onClick={() => void demote(u.id)}>Demote</button>
											) : (
												<button className="btn ghost" disabled={rolePending === u.id} onClick={() => void promote(u.id)}>Promote</button>
											)}
											<button
												className="btn"
												onClick={() => setExpandedId(expandedId === u.id ? null : u.id)}
											>
												{expandedId === u.id ? 'Close' : 'Manage'}
											</button>
										</div>
									</td>
								</tr>
								{expandedId === u.id && (
									<tr>
										<td colSpan={6} style={{ background: 'var(--bg-2)', padding: 'var(--space-4)' }}>
											<ManagePanel user={u} />
										</td>
									</tr>
								)}
							</Fragment>
						))}
					</tbody>
				</table>
			</div>

			{data && data.totalPages > 1 && (
				<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
					<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', alignSelf: 'center', marginRight: 8 }}>
						Page {page} of {data.totalPages}
					</span>
					<button className="btn ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
					<button className="btn ghost" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
				</div>
			)}
		</div>
	);
}

/**
 * Per-user management panel. Three independent sections:
 *   1. Change tier permanently (PATCH /api/admin/users/:id).
 *   2. Grant time-bounded growth/pro access (POST /api/admin/billing/grant-access).
 *   3. Per-feature overrides (CRUD on /api/admin/users/:id/feature-grants).
 *
 * Renders inline below the user row so the admin doesn't have to navigate
 * away. State is local to the panel; mutations invalidate the parent /users
 * list when relevant.
 */
function ManagePanel({ user }: { user: User }) {
	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)' }}>
			<TierChangeSection user={user} />
			<GrantAccessSection profileId={user.id} />
			<FeatureGrantsSection profileId={user.id} />
		</div>
	);
}

// ─── Section 1: permanent tier change ────────────────────────────────────────

function TierChangeSection({ user }: { user: User }) {
	const { mutate } = useSWRConfig();
	const [tier, setTier] = useState(user.user_type ?? 'free');
	const [pending, setPending] = useState(false);

	const update = async () => {
		setPending(true);
		try {
			await api('PATCH', `/api/admin/users/${user.id}`, { user_type: tier });
			toast.success('Tier updated');
			void mutate((key) => Array.isArray(key) && key[0] === '/api/admin/users');
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setPending(false);
		}
	};

	return (
		<div>
			<div className="co-stat-label" style={{ marginBottom: 8 }}>Permanent tier</div>
			<select
				className="search-input"
				style={{ width: '100%', marginBottom: 8 }}
				value={tier}
				onChange={(e) => setTier(e.target.value)}
			>
				{['free', 'growth', 'pro', 'admin'].map((t) => (
					<option key={t} value={t}>{t}</option>
				))}
			</select>
			<button
				className="btn"
				disabled={pending || tier === user.user_type}
				onClick={() => void update()}
			>
				{pending ? 'Saving…' : 'Save tier'}
			</button>
		</div>
	);
}

// ─── Section 2: time-bounded access grant ────────────────────────────────────

function GrantAccessSection({ profileId }: { profileId: string }) {
	const { mutate } = useSWRConfig();
	const [tier, setTier] = useState<'growth' | 'pro'>('pro');
	const [days, setDays] = useState(30);
	const [reason, setReason] = useState('');
	const [pending, setPending] = useState(false);

	const grant = async () => {
		setPending(true);
		try {
			await api('POST', '/api/admin/billing/grant-access', {
				profile_id: profileId,
				tier,
				days,
				reason: reason.trim() || undefined,
			});
			toast.success(`Granted ${tier} for ${days} day${days === 1 ? '' : 's'}`);
			setReason('');
			void mutate((key) => Array.isArray(key) && key[0] === '/api/admin/users');
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setPending(false);
		}
	};

	return (
		<div>
			<div className="co-stat-label" style={{ marginBottom: 8 }}>Grant time-bounded access</div>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 6, marginBottom: 6 }}>
				<select
					className="search-input"
					value={tier}
					onChange={(e) => setTier(e.target.value as 'growth' | 'pro')}
				>
					<option value="growth">Growth</option>
					<option value="pro">Pro</option>
				</select>
				<input
					className="search-input"
					type="number"
					min={1}
					max={3650}
					value={days}
					onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
				/>
			</div>
			<input
				className="search-input"
				placeholder="Reason (optional)"
				style={{ width: '100%', marginBottom: 8 }}
				value={reason}
				onChange={(e) => setReason(e.target.value)}
			/>
			<button className="btn" disabled={pending} onClick={() => void grant()}>
				{pending ? 'Granting…' : `Grant ${tier} · ${days}d`}
			</button>
		</div>
	);
}

// ─── Section 3: per-feature grants ───────────────────────────────────────────

function FeatureGrantsSection({ profileId }: { profileId: string }) {
	const { mutate } = useSWRConfig();
	const [slug, setSlug] = useState('csv_export');
	const [days, setDays] = useState<number | ''>(30);
	const [reason, setReason] = useState('');
	const [addPending, setAddPending] = useState(false);
	const [revokePending, setRevokePending] = useState(false);

	const { data } = useSWR<{ data: GrantRow[] }>(
		[`/api/admin/users/${profileId}/feature-grants`],
		{ dedupingInterval: 30_000 },
	);

	const grants = data?.data ?? [];
	const activeGrants = grants.filter(
		(g) => !g.revoked_at && (!g.expires_at || new Date(g.expires_at) > new Date()),
	);

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
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setAddPending(false);
		}
	};

	const revoke = async (s: string) => {
		setRevokePending(true);
		try {
			await api('DELETE', `/api/admin/users/${profileId}/feature-grants/${s}`);
			toast.success('Revoked');
			void refreshGrants();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setRevokePending(false);
		}
	};

	return (
		<div>
			<div className="co-stat-label" style={{ marginBottom: 8 }}>Per-feature grants</div>

			{activeGrants.length === 0 ? (
				<div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 10 }}>None active.</div>
			) : (
				<div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
					{activeGrants.map((g) => (
						<div
							key={g.id}
							style={{
								display: 'flex',
								alignItems: 'center',
								gap: 6,
								fontSize: 12,
								background: 'var(--bg-1)',
								padding: '4px 8px',
								border: '1px solid var(--border)',
							}}
						>
							<span style={{ fontFamily: 'var(--font-mono)', flex: 1 }}>{g.feature_slug}</span>
							<span style={{ color: 'var(--fg-muted)' }}>
								{g.expires_at ? `expires ${new Date(g.expires_at).toLocaleDateString()}` : 'permanent'}
							</span>
							<button
								className="btn ghost"
								style={{ padding: '2px 8px', fontSize: 11 }}
								disabled={revokePending}
								onClick={() => void revoke(g.feature_slug)}
							>
								Revoke
							</button>
						</div>
					))}
				</div>
			)}

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 6, marginBottom: 6 }}>
				<select className="search-input" value={slug} onChange={(e) => setSlug(e.target.value)}>
					{FEATURE_OPTIONS.map((s) => (
						<option key={s} value={s}>{s}</option>
					))}
				</select>
				<input
					className="search-input"
					type="number"
					min={0}
					placeholder="days"
					value={days}
					onChange={(e) => {
						const v = e.target.value;
						if (v === '') { setDays(''); return; }
						const n = Number(v);
						setDays(Number.isFinite(n) && n > 0 ? n : '');
					}}
				/>
			</div>
			<input
				className="search-input"
				placeholder="Reason (optional)"
				style={{ width: '100%', marginBottom: 8 }}
				value={reason}
				onChange={(e) => setReason(e.target.value)}
			/>
			<button className="btn" disabled={addPending} onClick={() => void add()}>
				{addPending ? 'Granting…' : `Grant ${slug}${days === '' ? ' (permanent)' : ` · ${days}d`}`}
			</button>
		</div>
	);
}
