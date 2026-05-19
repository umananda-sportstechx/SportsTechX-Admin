'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { PageHeader, Section, Empty, Tag } from '@/components/atoms';

interface CountResp { total: number }

interface ClaimRow {
	id: string;
	claim_type: string;
	target_name?: string | null;
	target_id?: string | null;
	is_verified: boolean;
	picked_up_at: string | null;
	created_at: string;
}
interface ClaimsResponse { data: ClaimRow[]; total: number }

interface DcrRow {
	id: string;
	entity_type: string;
	entity_id: string;
	notes: string | null;
	status: string;
	created_at: string;
}
interface DcrResponse { data: DcrRow[]; total: number }

/**
 * Admin operations dashboard. Surfaces the queues admins drain daily plus a
 * snapshot of the data warehouse size. Counts come from existing `total`
 * fields on list endpoints (limit:1 keeps the payload tiny).
 */
export default function AdminDashboard() {
	const { data: claimsPending } = useSWR<CountResp>(['/api/admin/claims', { status: 'pending', limit: 1 }]);
	const { data: dcrOpen }       = useSWR<CountResp>(['/api/admin/data-change-requests', { status: 'open', limit: 1 }]);
	const { data: companies }     = useSWR<CountResp>(['/api/companies', { limit: 1 }]);
	const { data: deals }         = useSWR<CountResp>(['/api/deals', { limit: 1 }]);
	const { data: investors }     = useSWR<CountResp>(['/api/investors', { limit: 1 }]);
	const { data: acquisitions }  = useSWR<CountResp>(['/api/acquisitions', { limit: 1 }]);
	const { data: users }         = useSWR<CountResp>(['/api/admin/users', { limit: 1 }]);
	const { data: pipeline }      = useSWR<CountResp>(['/api/admin/startups-pipeline', { status: 'new', limit: 1 }]);

	const { data: recentClaims }  = useSWR<ClaimsResponse>(['/api/admin/claims', { status: 'pending', limit: 5 }]);
	const { data: recentDcr }     = useSWR<DcrResponse>(['/api/admin/data-change-requests', { status: 'open', limit: 5 }]);

	const queues = [
		{ label: 'Pending claims',     value: claimsPending?.total ?? 0, href: '/claims?status=pending', urgent: (claimsPending?.total ?? 0) > 0 },
		{ label: 'Open data requests', value: dcrOpen?.total ?? 0,       href: '/data-requests',         urgent: (dcrOpen?.total ?? 0) > 0 },
		{ label: 'Pipeline (new)',     value: pipeline?.total ?? 0,      href: '/startups-pipeline',     urgent: (pipeline?.total ?? 0) > 0 },
	];

	const stats = [
		{ label: 'Companies',    value: companies?.total ?? 0,    href: '/companies' },
		{ label: 'Deals',        value: deals?.total ?? 0 },
		{ label: 'Investors',    value: investors?.total ?? 0 },
		{ label: 'M&A',          value: acquisitions?.total ?? 0 },
		{ label: 'Users',        value: users?.total ?? 0,        href: '/users' },
	];

	return (
		<div>
			<PageHeader
				kicker="Internal · admin tools"
				title="Operations overview"
				subtitle="Drain the queues, monitor the warehouse, and run the integrations from one place."
			/>

			{/* Active queues that need draining */}
			<div className="grid-3" style={{ marginBottom: 'var(--space-5)' }}>
				{queues.map((q) => (
					<Link
						key={q.label}
						href={q.href}
						className="card"
						style={{
							padding: 'var(--space-4)',
							textDecoration: 'none',
							color: 'inherit',
							borderTop: q.urgent ? `2px solid var(--accent)` : '2px solid transparent',
						}}
					>
						<div className="co-stat-label">{q.label}</div>
						<div
							style={{
								fontFamily: 'var(--font-display)',
								fontSize: 32,
								fontWeight: 800,
								letterSpacing: '-0.02em',
								marginTop: 4,
								color: q.urgent ? 'var(--accent)' : 'var(--fg)',
							}}
						>
							{q.value.toLocaleString()}
						</div>
					</Link>
				))}
			</div>

			{/* Warehouse snapshot */}
			<div className="grid-4" style={{ marginBottom: 'var(--space-5)', gridTemplateColumns: 'repeat(5, 1fr)' }}>
				{stats.map((s) => {
					const inner = (
						<>
							<div className="co-stat-label">{s.label}</div>
							<div
								style={{
									fontFamily: 'var(--font-display)',
									fontSize: 26,
									fontWeight: 800,
									letterSpacing: '-0.02em',
									marginTop: 4,
								}}
							>
								{s.value.toLocaleString()}
							</div>
						</>
					);
					return s.href ? (
						<Link
							key={s.label}
							href={s.href}
							className="card"
							style={{ padding: 'var(--space-4)', textDecoration: 'none', color: 'inherit' }}
						>
							{inner}
						</Link>
					) : (
						<div key={s.label} className="card" style={{ padding: 'var(--space-4)' }}>
							{inner}
						</div>
					);
				})}
			</div>

			{/* Recent activity panels */}
			<div className="grid-2" style={{ marginBottom: 'var(--space-5)' }}>
				<Section title="Recent pending claims" meta={`${claimsPending?.total ?? 0} total`} padded={false}>
					{!recentClaims?.data?.length ? (
						<Empty msg="No pending claims" />
					) : (
						<table className="data-table">
							<thead><tr><th>Created</th><th>Type</th><th>Target</th><th></th></tr></thead>
							<tbody>
								{recentClaims.data.map((c) => (
									<tr key={c.id}>
										<td className="num">{new Date(c.created_at).toLocaleDateString()}</td>
										<td>{c.claim_type}</td>
										<td>{c.target_name ?? c.target_id ?? '—'}</td>
										<td style={{ textAlign: 'right' }}><Link href="/claims?status=pending" className="btn ghost">Open</Link></td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</Section>

				<Section title="Recent open requests" meta={`${dcrOpen?.total ?? 0} total`} padded={false}>
					{!recentDcr?.data?.length ? (
						<Empty msg="No open requests" />
					) : (
						<table className="data-table">
							<thead><tr><th>Created</th><th>Entity</th><th>Notes</th><th></th></tr></thead>
							<tbody>
								{recentDcr.data.map((r) => (
									<tr key={r.id}>
										<td className="num">{new Date(r.created_at).toLocaleDateString()}</td>
										<td>{r.entity_type}</td>
										<td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
											{r.notes ?? '—'}
										</td>
										<td style={{ textAlign: 'right' }}><Link href="/data-requests" className="btn ghost">Open</Link></td>
									</tr>
								))}
							</tbody>
						</table>
					)}
				</Section>
			</div>

			{/* Shortcuts */}
			<div className="card" style={{ padding: 'var(--space-4)' }}>
				<div
					style={{
						fontFamily: 'var(--font-mono)',
						fontSize: 11,
						color: 'var(--fg-muted)',
						textTransform: 'uppercase',
						letterSpacing: '0.08em',
						marginBottom: 12,
					}}
				>
					Shortcuts
				</div>
				<div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
					<Link href="/jobs"><button className="btn ghost">Run integrations & jobs</button></Link>
					<Link href="/reports"><button className="btn ghost">Publish a report</button></Link>
					<Link href="/billing"><button className="btn ghost">Grant trial / credits</button></Link>
					<Link href="/sales"><button className="btn ghost">Sales pipeline</button></Link>
					<Link href="/analytics"><button className="btn ghost">Analytics</button></Link>
				</div>
				<div style={{ marginTop: 16, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>
					<Tag>API</Tag> All endpoints are backed by the new NestJS server. RLS keeps every admin table locked down to <code>profiles.user_role = &apos;admin&apos;</code>.
				</div>
			</div>
		</div>
	);
}
