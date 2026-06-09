'use client';

import { Fragment, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState, StatCard, Section } from '@/components/atoms';
import { ComboBarLine, PieDonut, PieLegend, Funnel, toSegments, type Bucket } from '@/components/charts';
import { FilterBar, FilterSelect, StatStrip } from '@/components/filters';

interface UserStats { total: number; admins: number; by_tier: Bucket[]; by_role: Bucket[]; signups_by_month: Bucket[] }
interface AuthRow { email: string | null; created_at?: string | null; last_sign_in_at?: string | null; provider?: string | null }
interface AuthActivity {
	total: number; signups_7d: number; signups_30d: number; active_7d: number; active_30d: number;
	signups_in_range?: number; active_in_range?: number;
	recent_signups: AuthRow[]; recent_logins: AuthRow[]; by_provider: Bucket[];
}
interface UserAnalytics {
	conversion: { total: number; trials: number; paid: number; free_to_trial_pct: number; trial_to_paid_pct: number };
	churn: { churned: number; active: number; churn_rate_pct: number; avg_lifetime_days: number | null };
	login_recency: Bucket[]; signup_recency: Bucket[]; login_frequency: Bucket[];
	report_downloads: { total: number; unique_users: number; last_30d: number; in_range?: number; top_reports: Bucket[]; daily_trend: Bucket[]; weekly_trend?: Bucket[]; by_day_of_week?: Bucket[] };
}
const FREQ_BUCKETS: Record<string, 'never' | 'once' | '2-5' | '6+'> = { 'never (0)': 'never', once: 'once', '2-5': '2-5', '6+': '6+' };
const TIERS = ['free', 'growth', 'pro'] as const;
const ROLES = ['user', 'admin'] as const;

interface User {
	id: string;
	email: string | null;
	display_name: string | null;
	user_role: string | null;
	user_type: string | null;
	company_name: string | null;
	created_at: string;
	last_seen_at: string | null;
	is_trial?: boolean;
	trial_ends_at?: string | null;
	active_subscription?: boolean;
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

interface FeatureCatalogRow { id: string; slug: string; name: string }

export default function UsersAdminPage() {
	const { mutate } = useSWRConfig();
	const [search, setSearch] = useState('');
	const [role, setRole] = useState('');
	const [tier, setTier] = useState('');
	const [page, setPage] = useState(1);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [rolePending, setRolePending] = useState<string | null>(null);
	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');
	const [freqBucket, setFreqBucket] = useState<'never' | 'once' | '2-5' | '6+' | null>(null);
	const [reportUsersOpen, setReportUsersOpen] = useState(false);

	const { data, error, isLoading } = useSWR<UsersResponse>(
		['/api/admin/users', { q: search || undefined, role: role || undefined, tier: tier || undefined, page, limit: 30 }],
		{ dedupingInterval: 15_000 },
	);
	const stats = useSWR<UserStats>(['/api/admin/stats/users'], { dedupingInterval: 60_000 });
	const range = { from: from || undefined, to: to || undefined };
	const auth = useSWR<AuthActivity>(['/api/admin/users/auth-activity', range], { dedupingInterval: 60_000 });
	const an = useSWR<UserAnalytics>(['/api/admin/users/analytics', range], { dedupingInterval: 60_000 });
	const tierSegments = toSegments(stats.data?.by_tier ?? []);
	const providerSegments = toSegments(auth.data?.by_provider ?? []);
	const signupChart = (stats.data?.signups_by_month ?? []).map((b) => ({ label: b.label.slice(2), amt: b.value, deals: b.value }));
	const loginRecencySeg = toSegments(an.data?.login_recency ?? []);
	const signupRecencySeg = toSegments(an.data?.signup_recency ?? []);
	const freqSeg = toSegments(an.data?.login_frequency ?? []);
	const topReportsSeg = toSegments(an.data?.report_downloads.top_reports ?? []);
	const dlWeeklyChart = (an.data?.report_downloads.weekly_trend ?? []).map((b) => ({ label: b.label.slice(5), amt: b.value, deals: b.value }));
	const dowSeg = toSegments(an.data?.report_downloads.by_day_of_week ?? []);
	const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' }) : '—');

	// Export the current (filtered) user set to CSV — fetches up to 5k rows.
	const [exporting, setExporting] = useState(false);
	const exportCsv = async () => {
		setExporting(true);
		try {
			const res = await api<UsersResponse>('GET', `/api/admin/users?${new URLSearchParams({
				...(search ? { q: search } : {}), ...(role ? { role } : {}), ...(tier ? { tier } : {}), limit: '5000',
			}).toString()}`);
			const rows = res.data ?? [];
			const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
			const plan = (u: User) => u.is_trial ? `trial${u.trial_ends_at ? ` until ${u.trial_ends_at.slice(0, 10)}` : ''}` : u.active_subscription ? 'paid' : '';
			const csv = ['email,name,tier,plan,role,company,joined,last_seen',
				...rows.map((u) => [u.email, u.display_name, u.user_type, plan(u), u.user_role, u.company_name, u.created_at, u.last_seen_at].map(esc).join(','))].join('\n');
			const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
			const a = document.createElement('a'); a.href = url; a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(url);
			toast.success(`Exported ${rows.length} users`);
		} catch (e) { toast.error((e as Error).message); }
		finally { setExporting(false); }
	};

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
			<PageHeader kicker={`Identity · ${(stats.data?.total ?? data?.total ?? 0).toLocaleString()} total`} title="Users" />

			<StatStrip cols={4}>
				<StatCard label="Total users" loading={stats.isLoading} value={(stats.data?.total ?? 0).toLocaleString()} />
				<StatCard label="Admins" loading={stats.isLoading} value={(stats.data?.admins ?? 0).toLocaleString()} />
				{(stats.data?.by_tier ?? []).slice(0, 2).map((b) => (
					<StatCard key={b.label} label={`${b.label} tier`} loading={stats.isLoading} value={b.value.toLocaleString()} />
				))}
			</StatStrip>

			<div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<Section title="Signups by month" meta="last 12 months">
					<AsyncState loading={stats.isLoading} error={stats.error} empty={signupChart.length === 0} emptyMsg="No signups" onRetry={() => void stats.mutate()}>
						<ComboBarLine data={signupChart} height={240} valueFormatter={(v) => String(Math.round(v))} barLabel="Signups" lineLabel="signups" />
					</AsyncState>
				</Section>
				<Section title="By tier" meta="users">
					<AsyncState loading={stats.isLoading} error={stats.error} empty={tierSegments.length === 0} emptyMsg="No data" onRetry={() => void stats.mutate()}>
						<div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
							<PieDonut segments={tierSegments} size={170} mode="donut" />
							<PieLegend segments={tierSegments} />
						</div>
					</AsyncState>
				</Section>
			</div>

			{/* Analytics date-range — windows provider mix, in-range counts, and report-download trends */}
			<div className="card" style={{ padding: 12, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
				<span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Analytics window</span>
				<input className="search-input" type="date" style={{ height: 30 }} value={from} onChange={(e) => setFrom(e.target.value)} title="From" />
				<span style={{ color: 'var(--fg-muted)' }}>→</span>
				<input className="search-input" type="date" style={{ height: 30 }} value={to} onChange={(e) => setTo(e.target.value)} title="To" />
				{(from || to) && <button className="btn ghost" onClick={() => { setFrom(''); setTo(''); }}>Clear (last 30d)</button>}
				{(from || to) && <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>· {(auth.data?.signups_in_range ?? 0).toLocaleString()} signups · {(auth.data?.active_in_range ?? 0).toLocaleString()} active · {(an.data?.report_downloads.in_range ?? 0).toLocaleString()} downloads in range</span>}
			</div>

			{/* Sign-in / sign-up activity — straight from Supabase auth */}
			<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>
				Sign-in / sign-up activity · Supabase auth
			</div>
			<StatStrip cols={4}>
				<StatCard label="Auth users" loading={auth.isLoading} value={(auth.data?.total ?? 0).toLocaleString()} />
				<StatCard label="Signups · 7d" loading={auth.isLoading} value={(auth.data?.signups_7d ?? 0).toLocaleString()} />
				<StatCard label="Active · 7d" loading={auth.isLoading} value={(auth.data?.active_7d ?? 0).toLocaleString()} />
				<StatCard label="Active · 30d" loading={auth.isLoading} value={(auth.data?.active_30d ?? 0).toLocaleString()} />
			</StatStrip>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<Section title="Recent signups" meta="newest first" padded={false}>
					<AsyncState loading={auth.isLoading} error={auth.error} empty={(auth.data?.recent_signups?.length ?? 0) === 0} emptyMsg="No signups" onRetry={() => void auth.mutate()}>
						<table className="data-table">
							<thead><tr><th>Email</th><th>Joined</th><th>Via</th></tr></thead>
							<tbody>
								{(auth.data?.recent_signups ?? []).map((r, i) => (
									<tr key={`${r.email}-${i}`}><td>{r.email ?? '—'}</td><td className="num">{fmtDate(r.created_at)}</td><td>{r.provider ?? 'email'}</td></tr>
								))}
							</tbody>
						</table>
					</AsyncState>
				</Section>
				<Section title="Recent logins" meta="last sign-in" padded={false}>
					<AsyncState loading={auth.isLoading} error={auth.error} empty={(auth.data?.recent_logins?.length ?? 0) === 0} emptyMsg="No logins" onRetry={() => void auth.mutate()}>
						<table className="data-table">
							<thead><tr><th>Email</th><th>Last sign-in</th><th>Via</th></tr></thead>
							<tbody>
								{(auth.data?.recent_logins ?? []).map((r, i) => (
									<tr key={`${r.email}-${i}`}><td>{r.email ?? '—'}</td><td className="num">{fmtDate(r.last_sign_in_at)}</td><td>{r.provider ?? 'email'}</td></tr>
								))}
							</tbody>
						</table>
					</AsyncState>
				</Section>
				<Section title="Login method" meta="all auth users">
					<AsyncState loading={auth.isLoading} error={auth.error} empty={providerSegments.length === 0} emptyMsg="No data" onRetry={() => void auth.mutate()}>
						<div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
							<PieDonut segments={providerSegments} size={150} mode="donut" />
							<PieLegend segments={providerSegments} />
						</div>
					</AsyncState>
				</Section>
			</div>

			{/* Growth analytics — conversions, churn, recency/frequency, report downloads */}
			<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 10px' }}>
				Growth analytics
			</div>
			<StatStrip cols={4}>
				<StatCard label="Free → trial" loading={an.isLoading} value={`${(an.data?.conversion.free_to_trial_pct ?? 0).toFixed(1)}%`} />
				<StatCard label="Trial → paid" loading={an.isLoading} value={`${(an.data?.conversion.trial_to_paid_pct ?? 0).toFixed(1)}%`} />
				<StatCard label="Churn rate" loading={an.isLoading} value={`${(an.data?.churn.churn_rate_pct ?? 0).toFixed(1)}%`} urgent={(an.data?.churn.churn_rate_pct ?? 0) > 0} />
				<StatCard label="Avg lifetime" loading={an.isLoading} value={an.data?.churn.avg_lifetime_days != null ? `${Math.round(an.data.churn.avg_lifetime_days)}d` : '—'} />
			</StatStrip>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<Section title="Conversion funnel" meta="free → trial → paid">
					<Funnel stages={[
						{ label: 'Total users', value: an.data?.conversion.total ?? 0 },
						{ label: 'Started a trial', value: an.data?.conversion.trials ?? 0 },
						{ label: 'Paying', value: an.data?.conversion.paid ?? 0, color: 'var(--pos)' },
						{ label: 'Churned', value: an.data?.churn.churned ?? 0, color: 'var(--neg)' },
					]} />
				</Section>
				<Section title="Login frequency" meta="per user · click to drill in">
					<AsyncState loading={an.isLoading} error={an.error} empty={freqSeg.length === 0} emptyMsg="No data" onRetry={() => void an.mutate()}>
						<PieDonut segments={freqSeg} mode="bar" />
						<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
							{(an.data?.login_frequency ?? []).map((b) => {
								const bucket = FREQ_BUCKETS[b.label];
								return bucket ? <button key={b.label} className="chip" onClick={() => setFreqBucket(bucket)}>{b.label}: {b.value.toLocaleString()}</button> : null;
							})}
						</div>
					</AsyncState>
				</Section>
			</div>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<Section title="Signup recency" meta="account age">
					<AsyncState loading={an.isLoading} error={an.error} empty={signupRecencySeg.length === 0} emptyMsg="No data" onRetry={() => void an.mutate()}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
							<PieDonut segments={signupRecencySeg} size={160} mode="donut" />
							<div style={{ flex: 1, minWidth: 150 }}><PieLegend segments={signupRecencySeg} /></div>
						</div>
					</AsyncState>
				</Section>
				<Section title="Downloads · weekly trend" meta="downloads per week">
					<AsyncState loading={an.isLoading} error={an.error} empty={dlWeeklyChart.length === 0} emptyMsg="No downloads yet" onRetry={() => void an.mutate()}>
						<ComboBarLine data={dlWeeklyChart} height={200} valueFormatter={(v) => String(Math.round(v))} barLabel="Downloads" lineLabel="downloads" />
					</AsyncState>
				</Section>
			</div>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<Section title="Login recency" meta="last seen">
					<AsyncState loading={an.isLoading} error={an.error} empty={loginRecencySeg.length === 0} emptyMsg="No data" onRetry={() => void an.mutate()}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
							<PieDonut segments={loginRecencySeg} size={160} mode="donut" />
							<div style={{ flex: 1, minWidth: 150 }}><PieLegend segments={loginRecencySeg} /></div>
						</div>
					</AsyncState>
				</Section>
				<Section title={`Report downloads · ${(an.data?.report_downloads.total ?? 0).toLocaleString()} total · ${(an.data?.report_downloads.unique_users ?? 0).toLocaleString()} users`} meta="top reports">
					<AsyncState loading={an.isLoading} error={an.error} empty={topReportsSeg.length === 0} emptyMsg="No downloads yet" onRetry={() => void an.mutate()}>
						<PieDonut segments={topReportsSeg} mode="bar" />
						{dowSeg.length > 0 && (
							<>
								<div style={{ fontSize: 11, color: 'var(--fg-muted)', margin: '12px 0 6px' }}>By day of week</div>
								<PieDonut segments={dowSeg} mode="bar" />
							</>
						)}
						<button className="btn ghost" style={{ marginTop: 10 }} onClick={() => setReportUsersOpen(true)}>View per-user downloads →</button>
					</AsyncState>
				</Section>
			</div>

			<FilterBar>
				<input
					className="search-input"
					style={{ flex: '0 0 280px', height: 32 }}
					placeholder="Search email or name…"
					value={search}
					onChange={(e) => { setSearch(e.target.value); setPage(1); }}
				/>
				<FilterSelect ariaLabel="Tier" value={tier} onChange={(v) => { setTier(v); setPage(1); }} options={[...TIERS]} allLabel="All tiers" />
				<FilterSelect ariaLabel="Role" value={role} onChange={(v) => { setRole(v); setPage(1); }} options={[...ROLES]} allLabel="All roles" />
				<div style={{ flex: 1 }} />
				<button className="btn ghost" disabled={exporting} onClick={() => void exportCsv()}>{exporting ? 'Exporting…' : 'Export CSV'}</button>
			</FilterBar>

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={users.length === 0} emptyMsg={search ? 'No users match.' : 'No users yet.'} onRetry={() => void refresh()}>
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
									<td>
										<span className="tag">{u.user_type ?? 'free'}</span>
										{u.is_trial
											? <span className="tag warn" title={u.trial_ends_at ? `Trial ends ${fmtDate(u.trial_ends_at)}` : 'On trial'} style={{ marginLeft: 4 }}>trial{u.trial_ends_at ? ` · ends ${fmtDate(u.trial_ends_at)}` : ''}</span>
											: u.active_subscription ? <span className="tag pos" style={{ marginLeft: 4 }}>paid</span> : null}
									</td>
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
				</AsyncState>
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

			{freqBucket && <LoginUsersModal bucket={freqBucket} onClose={() => setFreqBucket(null)} />}
			{reportUsersOpen && <ReportUsersModal onClose={() => setReportUsersOpen(false)} />}
		</div>
	);
}

// ─── Drill-down: users in a login-frequency bucket ───────────────────────────
interface LoginUser { id: string; email: string | null; display_name: string | null; login_count: number; last_seen_at: string | null; created_at: string }
function LoginUsersModal({ bucket, onClose }: { bucket: string; onClose: () => void }) {
	const [q, setQ] = useState('');
	const { data, isLoading } = useSWR<{ users: LoginUser[] }>([`/api/admin/users/analytics/login-users`, { bucket, q: q || undefined }], { dedupingInterval: 10_000 });
	const users = data?.users ?? [];
	const exportCsv = () => {
		const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
		const csv = ['email,name,login_count,last_seen,joined', ...users.map((u) => [u.email, u.display_name, u.login_count, u.last_seen_at, u.created_at].map(esc).join(','))].join('\n');
		const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
		const a = document.createElement('a'); a.href = url; a.download = `login-${bucket}.csv`; a.click(); URL.revokeObjectURL(url);
	};
	return (
		<Modal title={`Users · login frequency “${bucket}”`} onClose={onClose} width={620} footer={<><button className="btn ghost" onClick={onClose}>Close</button><button className="btn" disabled={!users.length} onClick={exportCsv}>Export CSV</button></>}>
			<input className="search-input" style={{ marginBottom: 10 }} placeholder="Search email or name…" value={q} onChange={(e) => setQ(e.target.value)} />
			<AsyncState loading={isLoading} empty={users.length === 0} emptyMsg="No users in this bucket.">
				<table className="data-table">
					<thead><tr><th>Email</th><th>Name</th><th>Logins</th><th>Last seen</th></tr></thead>
					<tbody>
						{users.map((u) => (
							<tr key={u.id}><td>{u.email ?? '—'}</td><td>{u.display_name ?? '—'}</td><td className="num">{u.login_count}</td><td className="num">{u.last_seen_at ? new Date(u.last_seen_at).toLocaleDateString() : '—'}</td></tr>
						))}
					</tbody>
				</table>
			</AsyncState>
		</Modal>
	);
}

// ─── Drill-down: per-user report downloads ───────────────────────────────────
interface ReportUser { id: string; email: string | null; display_name: string | null; downloads: number; last_download: string | null }
function ReportUsersModal({ onClose }: { onClose: () => void }) {
	const [q, setQ] = useState('');
	const [page, setPage] = useState(1);
	const { data, isLoading } = useSWR<{ data: ReportUser[]; total: number; totalPages: number }>(
		[`/api/admin/users/analytics/report-users`, { q: q || undefined, page, limit: 25 }], { dedupingInterval: 10_000 },
	);
	const rows = data?.data ?? [];
	return (
		<Modal title={`Per-user report downloads · ${(data?.total ?? 0).toLocaleString()} users`} onClose={onClose} width={620} footer={<button className="btn ghost" onClick={onClose}>Close</button>}>
			<input className="search-input" style={{ marginBottom: 10 }} placeholder="Search email or name…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
			<AsyncState loading={isLoading} empty={rows.length === 0} emptyMsg="No downloads yet.">
				<table className="data-table">
					<thead><tr><th>Email</th><th>Name</th><th>Downloads</th><th>Last</th></tr></thead>
					<tbody>
						{rows.map((u) => (
							<tr key={u.id}><td>{u.email ?? '—'}</td><td>{u.display_name ?? '—'}</td><td className="num">{u.downloads}</td><td className="num">{u.last_download ? new Date(u.last_download).toLocaleDateString() : '—'}</td></tr>
						))}
					</tbody>
				</table>
			</AsyncState>
			{data && data.totalPages > 1 && (
				<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
					<button className="btn ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
					<button className="btn ghost" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
				</div>
			)}
		</Modal>
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
				{['free', 'growth', 'pro'].map((t) => (
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
	const [slug, setSlug] = useState('');
	const [days, setDays] = useState<number | ''>(30);
	const [reason, setReason] = useState('');
	const [addPending, setAddPending] = useState(false);
	const [revokePending, setRevokePending] = useState(false);

	// Fetch the live feature catalog so the dropdown can't drift from the DB
	// (the grant endpoint validates the slug against this same catalog).
	const { data: catalog } = useSWR<{ data: FeatureCatalogRow[] }>(['/api/admin/features'], { dedupingInterval: 5 * 60_000 });
	const featureOptions = catalog?.data ?? [];

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
					<option value="">Select feature…</option>
					{featureOptions.map((f) => (
						<option key={f.id} value={f.slug}>{f.name}</option>
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
			<button className="btn" disabled={addPending || !slug} onClick={() => void add()}>
				{addPending ? 'Granting…' : slug ? `Grant ${slug}${days === '' ? ' (permanent)' : ` · ${days}d`}` : 'Grant feature'}
			</button>
		</div>
	);
}
