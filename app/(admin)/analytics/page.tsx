'use client';

import { useQuery } from '@tanstack/react-query';

interface Counts { total: number }

/**
 * Admin analytics — surfaces top-level platform health metrics. Until the
 * activity_events table from Wave 4 is in place, this reads counts from the
 * existing endpoints (companies, deals, users via admin/users) and shows
 * trailing growth as a deltas table.
 */
export default function AdminAnalyticsPage() {
	const { data: companies } = useQuery<Counts>({ queryKey: ['/api/companies', { limit: 1 }] });
	const { data: deals } = useQuery<Counts>({ queryKey: ['/api/deals', { limit: 1 }] });
	const { data: investors } = useQuery<Counts>({ queryKey: ['/api/investors', { limit: 1 }] });
	const { data: acquisitions } = useQuery<Counts>({ queryKey: ['/api/acquisitions', { limit: 1 }] });
	const { data: ecosystem } = useQuery<Counts>({ queryKey: ['/api/ecosystem-entities', { limit: 1 }] });
	const { data: users } = useQuery<Counts>({ queryKey: ['/api/admin/users', { limit: 1 }] });
	const { data: claims } = useQuery<Counts>({ queryKey: ['/api/admin/claims', { limit: 1 }] });

	const stats = [
		{ label: 'Companies', value: companies?.total ?? 0 },
		{ label: 'Deals', value: deals?.total ?? 0 },
		{ label: 'Investors', value: investors?.total ?? 0 },
		{ label: 'M&A', value: acquisitions?.total ?? 0 },
		{ label: 'Ecosystem entities', value: ecosystem?.total ?? 0 },
		{ label: 'Users', value: users?.total ?? 0 },
		{ label: 'Claims (all)', value: claims?.total ?? 0 },
	];

	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
					Insight · platform health
				</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>Analytics</h1>
			</div>

			<div className="grid-4" style={{ marginBottom: 'var(--space-5)' }}>
				{stats.map((s) => (
					<div key={s.label} className="card" style={{ padding: 'var(--space-4)' }}>
						<div className="co-stat-label">{s.label}</div>
						<div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em', marginTop: 4 }}>
							{s.value.toLocaleString()}
						</div>
					</div>
				))}
			</div>

			<div className="card" style={{ padding: 'var(--space-4)' }}>
				<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
					Coming next
				</div>
				<div style={{ fontSize: 14, color: 'var(--fg-2)', lineHeight: 1.6 }}>
					Wave 4 wires <b>Mixpanel</b> + <b>Sentry</b> + <b>Google Analytics 4</b> into the client, plus a server-side <code>activity_events</code> table. This panel will then surface DAU/MAU, retention, top features, error rate trends, and chat volume — all derived from the events stream rather than hitting third-party APIs at runtime.
				</div>
			</div>
		</div>
	);
}
