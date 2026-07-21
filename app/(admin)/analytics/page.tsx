'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { PageHeader, StatCard, AsyncState, Section } from '@/components/atoms';
import { ComboBarLine, HBarDrilldown, type HBarRow } from '@/components/charts';

const EVENT_COLORS = ['#79CABD', '#C0F4DE', '#6CA8FF', '#FFB36C', '#D99CFF', '#FF9CA8', '#9CE0C0'];

interface Counts { total: number }
interface DailyRow { day: string; active_users: number; events: number }
interface TopEvent { event_type: string; count: number }
interface TopContent { event_type: string; label: string; views: number; users: number }
interface TopUser { id: string; email: string | null; display_name: string | null; events: number; active_days: number; last_active: string }
interface AnalyticsResponse {
	range: string; daily: DailyRow[]; top_events: TopEvent[];
	top_content: TopContent[]; top_users: TopUser[]; active_users: number;
	include_team: boolean; team_events: number;
}
// Event types map to the kind of thing that was viewed.
const KIND_LABEL: Record<string, string> = {
	company_viewed: 'Company', report_viewed: 'Report', report_downloaded: 'Report',
	investor_viewed: 'Investor', deal_viewed: 'Deal', ecosystem_viewed: 'Ecosystem',
};

const RANGES = ['24h', '7d', '30d', '90d'] as const;
type Range = (typeof RANGES)[number];

/**
 * Admin analytics — DAU/active users + top events from the activity_events
 * stream (GET /api/admin/analytics), plus a platform-inventory strip of entity
 * counts. The activity panels render empty gracefully until events accumulate.
 */
export default function AdminAnalyticsPage() {
	const [range, setRange] = useState<Range>('30d');
	// Staff accounts generate almost all events, so customer-only is the honest default.
	const [includeTeam, setIncludeTeam] = useState(false);
	const { data: analytics, error: analyticsError, isLoading: analyticsLoading, mutate: mutateAnalytics } = useSWR<AnalyticsResponse>(
		['/api/admin/analytics', { range, include_team: includeTeam || undefined }],
		{ dedupingInterval: 30_000 },
	);

	const { data: companies } = useSWR<Counts>(['/api/companies', { limit: 1 }]);
	const { data: deals } = useSWR<Counts>(['/api/deals', { limit: 1 }]);
	const { data: investors } = useSWR<Counts>(['/api/investors', { limit: 1 }]);
	const { data: ecosystem } = useSWR<Counts>(['/api/ecosystem-entities', { limit: 1 }]);
	const { data: users } = useSWR<Counts>(['/api/admin/users', { limit: 1 }]);

	const daily = analytics?.daily ?? [];
	const peakUsers = daily.reduce((m, d) => Math.max(m, d.active_users), 0);
	const peakEvents = daily.reduce((m, d) => Math.max(m, d.events), 0);

	const chartData = daily.map((d) => ({
		label: new Date(d.day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
		amt: d.events,
		deals: d.active_users,
	}));
	const topEvents = analytics?.top_events ?? [];
	const topContent = analytics?.top_content ?? [];
	const topUsers = analytics?.top_users ?? [];
	const eventRows: HBarRow[] = topEvents.map((e, i) => ({
		id: e.event_type,
		label: e.event_type,
		value: e.count,
		formatted: e.count.toLocaleString(),
		color: EVENT_COLORS[i % EVENT_COLORS.length],
	}));

	const inventory = [
		{ label: 'Companies', value: companies?.total ?? 0 },
		{ label: 'Deals', value: deals?.total ?? 0 },
		{ label: 'Investors', value: investors?.total ?? 0 },
		{ label: 'Ecosystem', value: ecosystem?.total ?? 0 },
		{ label: 'Users', value: users?.total ?? 0 },
	];

	return (
		<div>
			<PageHeader kicker={`Insight · last ${range}`} title="Analytics" subtitle="Active users and event volume from the activity stream, plus a platform inventory snapshot." />

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)' }}>
				{RANGES.map((r) => (
					<button key={r} className={`chip ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>{r}</button>
				))}
				<div style={{ flex: 1 }} />
				<button className={`chip ${includeTeam ? 'on' : ''}`} onClick={() => setIncludeTeam((v) => !v)}
					title="Include @sportstechx.com and admin accounts">
					{includeTeam ? 'Including team' : 'Customers only'}
				</button>
			</div>

			{/* Without this, a near-empty page reads as broken instrumentation rather
			    than what it is: almost all recorded activity is the team's own. */}
			{!includeTeam && (analytics?.team_events ?? 0) > 0 && (
				<div className="card" style={{ padding: 'var(--space-3) var(--space-4)', marginBottom: 'var(--space-4)', fontSize: 12, color: 'var(--fg-muted)' }}>
					Showing customer activity only. <strong>{(analytics?.team_events ?? 0).toLocaleString()}</strong> events from
					{' '}@sportstechx.com and admin accounts are excluded — switch to “Including team” to see them.
				</div>
			)}

			<div className="grid-4" style={{ marginBottom: 'var(--space-5)' }}>
				<StatCard label={`Active users (${range})`} loading={analyticsLoading} value={(analytics?.active_users ?? 0).toLocaleString()} />
				<StatCard label="Peak DAU" loading={analyticsLoading} value={peakUsers.toLocaleString()} />
				<StatCard label="Peak daily events" loading={analyticsLoading} value={peakEvents.toLocaleString()} />
				<StatCard label="Days with activity" loading={analyticsLoading} value={daily.length.toLocaleString()} />
			</div>

			<div className="grid-2" style={{ marginBottom: 'var(--space-5)' }}>
				<Section title="Activity trend" meta="bars = events · line = active users">
					<AsyncState loading={analyticsLoading} error={analyticsError} empty={chartData.length === 0} emptyMsg="No events recorded in this range yet" onRetry={() => void mutateAnalytics()}>
						<ComboBarLine data={chartData} height={260} barLabel="Events" lineLabel="active users" valueFormatter={(v) => v.toLocaleString()} />
					</AsyncState>
				</Section>
				<Section title="Top events" meta="by volume in range">
					<AsyncState loading={analyticsLoading} error={analyticsError} empty={eventRows.length === 0} emptyMsg="No events recorded in this range yet" onRetry={() => void mutateAnalytics()}>
						<HBarDrilldown rows={eventRows} />
					</AsyncState>
				</Section>
			</div>

			<div className="grid-2" style={{ marginBottom: 'var(--space-5)' }}>
				<Section title="Daily activity" meta={`${daily.length} days with events`} padded={false}>
					<AsyncState loading={analyticsLoading} error={analyticsError} empty={daily.length === 0} emptyMsg="No events recorded in this range yet" onRetry={() => void mutateAnalytics()}>
						<table className="data-table">
							<thead><tr><th>Day</th><th>Active users</th><th>Events</th></tr></thead>
							<tbody>
								{daily.map((d) => (
									<tr key={d.day}>
										<td className="num">{new Date(d.day).toLocaleDateString()}</td>
										<td className="num">{d.active_users.toLocaleString()}</td>
										<td className="num">{d.events.toLocaleString()}</td>
									</tr>
								))}
							</tbody>
						</table>
					</AsyncState>
				</Section>

				<Section title="Most viewed content" meta="resolved to names · this range" padded={false}>
					<AsyncState loading={analyticsLoading} error={analyticsError} empty={topContent.length === 0} emptyMsg="No content views recorded in this range yet" onRetry={() => void mutateAnalytics()}>
						<div className="table-scroll">
							<table className="data-table">
								<thead><tr><th>Kind</th><th>Content</th><th style={{ textAlign: 'right' }}>Views</th><th style={{ textAlign: 'right' }}>Users</th></tr></thead>
								<tbody>
									{topContent.map((c) => (
										<tr key={`${c.event_type}-${c.label}`}>
											<td><span className="tag">{KIND_LABEL[c.event_type] ?? c.event_type}</span></td>
											<td>{c.label}</td>
											<td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{c.views.toLocaleString()}</td>
											<td className="num" style={{ textAlign: 'right', color: 'var(--fg-muted)' }}>{c.users.toLocaleString()}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</AsyncState>
				</Section>
			</div>

			<div style={{ marginBottom: 'var(--space-5)' }}>
				<Section title="Most active users" meta="by events in range · click to open" padded={false}>
					<AsyncState loading={analyticsLoading} error={analyticsError} empty={topUsers.length === 0} emptyMsg="No user activity in this range yet" onRetry={() => void mutateAnalytics()}>
						<div className="table-scroll">
							<table className="data-table">
								<thead><tr><th>User</th><th style={{ textAlign: 'right' }}>Events</th><th style={{ textAlign: 'right' }}>Active days</th><th>Last active</th><th /></tr></thead>
								<tbody>
									{topUsers.map((u) => (
										<tr key={u.id}>
											<td>
												<div>{u.display_name ?? u.email ?? '—'}</div>
												{u.display_name && u.email && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{u.email}</div>}
											</td>
											<td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{u.events.toLocaleString()}</td>
											<td className="num" style={{ textAlign: 'right', color: 'var(--fg-muted)' }}>{u.active_days}</td>
											<td className="num">{new Date(u.last_active).toLocaleDateString()}</td>
											<td style={{ textAlign: 'right' }}><Link href={`/users/${u.id}`} className="btn ghost">Open →</Link></td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					</AsyncState>
				</Section>
			</div>

			<div className="card" style={{ padding: 'var(--space-4)' }}>
				<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
					Platform inventory
				</div>
				<div className="grid-4">
					{inventory.map((s) => (
						<div key={s.label}>
							<div className="co-stat-label">{s.label}</div>
							<div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, marginTop: 2 }}>{s.value.toLocaleString()}</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
