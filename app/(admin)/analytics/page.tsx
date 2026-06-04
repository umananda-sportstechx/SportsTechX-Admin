'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { PageHeader, StatCard, AsyncState } from '@/components/atoms';
import { ComboBarLine, HBarDrilldown, type HBarRow } from '@/components/charts';

const EVENT_COLORS = ['#79CABD', '#C0F4DE', '#6CA8FF', '#FFB36C', '#D99CFF', '#FF9CA8', '#9CE0C0'];

interface Counts { total: number }
interface DailyRow { day: string; active_users: number; events: number }
interface TopEvent { event_type: string; count: number }
interface AnalyticsResponse { range: string; daily: DailyRow[]; top_events: TopEvent[]; active_users: number }

const RANGES = ['24h', '7d', '30d', '90d'] as const;
type Range = (typeof RANGES)[number];

/**
 * Admin analytics — DAU/active users + top events from the activity_events
 * stream (GET /api/admin/analytics), plus a platform-inventory strip of entity
 * counts. The activity panels render empty gracefully until events accumulate.
 */
export default function AdminAnalyticsPage() {
	const [range, setRange] = useState<Range>('30d');
	const { data: analytics, error: analyticsError, isLoading: analyticsLoading, mutate: mutateAnalytics } = useSWR<AnalyticsResponse>(
		['/api/admin/analytics', { range }],
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
			</div>

			<div className="grid-4" style={{ marginBottom: 'var(--space-5)' }}>
				<StatCard label={`Active users (${range})`} loading={analyticsLoading} value={(analytics?.active_users ?? 0).toLocaleString()} />
				<StatCard label="Peak DAU" loading={analyticsLoading} value={peakUsers.toLocaleString()} />
				<StatCard label="Peak daily events" loading={analyticsLoading} value={peakEvents.toLocaleString()} />
				<StatCard label="Days with activity" loading={analyticsLoading} value={daily.length.toLocaleString()} />
			</div>

			<div className="grid-2" style={{ marginBottom: 'var(--space-5)' }}>
				<div className="card">
					<div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Activity trend <span style={{ fontWeight: 400, color: 'var(--fg-muted)', fontSize: 12 }}>· bars = events · line = active users</span></div>
					<div style={{ padding: 'var(--space-4)' }}>
						<AsyncState loading={analyticsLoading} error={analyticsError} empty={chartData.length === 0} emptyMsg="No events recorded in this range yet" onRetry={() => void mutateAnalytics()}>
							<ComboBarLine data={chartData} height={260} barLabel="Events" lineLabel="active users" valueFormatter={(v) => v.toLocaleString()} />
						</AsyncState>
					</div>
				</div>
				<div className="card">
					<div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Top events</div>
					<div style={{ padding: 'var(--space-4)' }}>
						<AsyncState loading={analyticsLoading} error={analyticsError} empty={eventRows.length === 0} emptyMsg="No events recorded in this range yet" onRetry={() => void mutateAnalytics()}>
							<HBarDrilldown rows={eventRows} />
						</AsyncState>
					</div>
				</div>
			</div>

			<div className="grid-2" style={{ marginBottom: 'var(--space-5)' }}>
				<div className="card">
					<div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Daily activity</div>
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
				</div>

				<div className="card">
					<div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)', fontWeight: 700 }}>Top events</div>
					<AsyncState loading={analyticsLoading} error={analyticsError} empty={(analytics?.top_events ?? []).length === 0} emptyMsg="No events recorded in this range yet" onRetry={() => void mutateAnalytics()}>
						<table className="data-table">
							<thead><tr><th>Event</th><th>Count</th></tr></thead>
							<tbody>
								{(analytics?.top_events ?? []).map((e) => (
									<tr key={e.event_type}>
										<td>{e.event_type}</td>
										<td className="num">{e.count.toLocaleString()}</td>
									</tr>
								))}
							</tbody>
						</table>
					</AsyncState>
				</div>
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
