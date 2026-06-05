'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { PageHeader, Section, AsyncState, StatCard, Tag } from '@/components/atoms';
import { ComboBarLine, PieDonut, PieLegend, toSegments } from '@/components/charts';

const fmtMoney = (n: number): string =>
	n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`;

interface AnnualRow { year: number; total_amount: number | string; deal_count: number }
interface SectorHeatRow { sector_name: string; deal_count: number; total_amount: number | string }
interface InvestorTypeRow { category: string; count: number }

interface ClaimRow {
	id: string;
	claim_type: string;
	entity_type?: string | null;
	entity_name?: string | null;
	entity_id?: string | null;
	is_verified: boolean;
	picked_up_at: string | null;
	created_at: string;
}
interface ClaimsResponse { data: ClaimRow[]; total: number }

interface DcrRow {
	id: string;
	entity_type: string;
	target_name_snapshot?: string | null;
	field_change?: string | null;
	status: string;
	created_at: string;
}
interface DcrResponse { data: DcrRow[]; total: number }
interface CountResp { total: number }

/**
 * Admin operations dashboard. Surfaces the queues admins drain daily plus a
 * snapshot of the data warehouse size. Counts are read off the `total` of the
 * limit:5 list calls below — no separate limit:1 ping needed.
 */
export default function AdminDashboard() {
	const claims      = useSWR<ClaimsResponse>(['/api/admin/claims', { status: 'pending', limit: 5 }]);
	const dcr         = useSWR<DcrResponse>(['/api/admin/data-change-requests', { status: 'open', limit: 5 }]);
	const pipeline    = useSWR<CountResp>(['/api/admin/startups-pipeline', { status: 'new', limit: 1 }]);
	const companies   = useSWR<CountResp>(['/api/companies', { limit: 1 }]);
	const deals       = useSWR<CountResp>(['/api/deals', { limit: 1 }]);
	const investors   = useSWR<CountResp>(['/api/investors', { limit: 1 }]);
	const acquisitions = useSWR<CountResp>(['/api/acquisitions', { limit: 1 }]);
	const users       = useSWR<CountResp>(['/api/admin/users', { limit: 1 }]);

	// Warehouse trend + mix — reuses the public, cached analytics endpoints.
	const annual      = useSWR<AnnualRow[]>(['/api/analytics/annual-funding']);
	const sectorHeat  = useSWR<SectorHeatRow[]>(['/api/analytics/sector-heat']);
	const invByType   = useSWR<InvestorTypeRow[]>(['/api/analytics/investors-by-type']);

	const annualChart = (annual.data ?? []).map((r) => ({ year: r.year, amt: Number(r.total_amount), deals: r.deal_count }));
	const sectorSegments = toSegments((sectorHeat.data ?? []).slice(0, 8).map((r) => ({ label: r.sector_name, value: r.deal_count })));
	const investorSegments = toSegments((invByType.data ?? []).map((r) => ({ label: r.category, value: r.count })));

	const claimsTotal = claims.data?.total ?? 0;
	const dcrTotal = dcr.data?.total ?? 0;

	const queues = [
		{ label: 'Pending claims',     value: claimsTotal,                  href: '/claims?status=pending', loading: claims.isLoading,   urgent: claimsTotal > 0 },
		{ label: 'Open data requests', value: dcrTotal,                     href: '/data-requests',         loading: dcr.isLoading,      urgent: dcrTotal > 0 },
		{ label: 'Pipeline (new)',     value: pipeline.data?.total ?? 0,    href: '/startups-pipeline',     loading: pipeline.isLoading, urgent: (pipeline.data?.total ?? 0) > 0 },
	];

	const stats = [
		{ label: 'Companies', q: companies,   href: '/companies' },
		{ label: 'Deals',     q: deals },
		{ label: 'Investors', q: investors },
		{ label: 'M&A',       q: acquisitions },
		{ label: 'Users',     q: users,       href: '/users' },
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
					<StatCard key={q.label} label={q.label} href={q.href} loading={q.loading} urgent={q.urgent} value={q.value.toLocaleString()} />
				))}
			</div>

			{/* Warehouse snapshot */}
			<div className="grid-4" style={{ marginBottom: 'var(--space-5)', gridTemplateColumns: 'repeat(5, 1fr)' }}>
				{stats.map((s) => (
					<StatCard key={s.label} label={s.label} href={s.href} loading={s.q.isLoading} value={(s.q.data?.total ?? 0).toLocaleString()} />
				))}
			</div>

			{/* Funding trend + ecosystem mix */}
			<div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<Section title="Funding by year" meta="amount · rounds">
					<AsyncState loading={annual.isLoading} error={annual.error} empty={annualChart.length === 0} emptyMsg="No funding data" onRetry={() => void annual.mutate()}>
						<ComboBarLine data={annualChart} height={260} valueFormatter={fmtMoney} barLabel="Funding" lineLabel="rounds" />
					</AsyncState>
				</Section>
				<Section title="Top sectors" meta="by rounds">
					<AsyncState loading={sectorHeat.isLoading} error={sectorHeat.error} empty={sectorSegments.length === 0} emptyMsg="No sector data" onRetry={() => void sectorHeat.mutate()}>
						<div style={{ display: 'grid', placeItems: 'center', gap: 12 }}>
							<PieDonut segments={sectorSegments} size={180} mode="donut" />
							<PieLegend segments={sectorSegments} />
						</div>
					</AsyncState>
				</Section>
			</div>

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<Section title="Investors by type" meta="count">
					<AsyncState loading={invByType.isLoading} error={invByType.error} empty={investorSegments.length === 0} emptyMsg="No investor data" onRetry={() => void invByType.mutate()}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
							<PieDonut segments={investorSegments} size={180} mode="donut" />
							<div style={{ flex: 1, minWidth: 180 }}><PieLegend segments={investorSegments} /></div>
						</div>
					</AsyncState>
				</Section>
				<Section title="Funding mix" meta="rounds by sector">
					<AsyncState loading={sectorHeat.isLoading} error={sectorHeat.error} empty={sectorSegments.length === 0} emptyMsg="No data" onRetry={() => void sectorHeat.mutate()}>
						<PieDonut segments={sectorSegments} mode="bar" />
					</AsyncState>
				</Section>
			</div>

			{/* Recent activity panels */}
			<div className="grid-2" style={{ marginBottom: 'var(--space-5)' }}>
				<Section title="Recent pending claims" meta={`${claimsTotal} total`} padded={false}>
					<AsyncState loading={claims.isLoading} error={claims.error} empty={!claims.data?.data?.length} emptyMsg="No pending claims" onRetry={() => void claims.mutate()}>
						<table className="data-table">
							<thead><tr><th>Created</th><th>Type</th><th>Target</th><th></th></tr></thead>
							<tbody>
								{(claims.data?.data ?? []).map((c) => (
									<tr key={c.id}>
										<td className="num">{new Date(c.created_at).toLocaleDateString()}</td>
										<td>{c.entity_type ?? c.claim_type}</td>
										<td>{c.entity_name ?? c.entity_id ?? '—'}</td>
										<td style={{ textAlign: 'right' }}><Link href="/claims?status=pending" className="btn ghost">Open</Link></td>
									</tr>
								))}
							</tbody>
						</table>
					</AsyncState>
				</Section>

				<Section title="Recent open requests" meta={`${dcrTotal} total`} padded={false}>
					<AsyncState loading={dcr.isLoading} error={dcr.error} empty={!dcr.data?.data?.length} emptyMsg="No open requests" onRetry={() => void dcr.mutate()}>
						<table className="data-table">
							<thead><tr><th>Created</th><th>Target</th><th>Change</th><th></th></tr></thead>
							<tbody>
								{(dcr.data?.data ?? []).map((r) => (
									<tr key={r.id}>
										<td className="num">{new Date(r.created_at).toLocaleDateString()}</td>
										<td>{r.target_name_snapshot ?? r.entity_type}</td>
										<td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
											{r.field_change ?? '—'}
										</td>
										<td style={{ textAlign: 'right' }}><Link href="/data-requests" className="btn ghost">Open</Link></td>
									</tr>
								))}
							</tbody>
						</table>
					</AsyncState>
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
