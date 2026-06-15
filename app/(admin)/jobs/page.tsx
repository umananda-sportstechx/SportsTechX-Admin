'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { InvestorSelectOne } from '@/components/entity-pickers';

type EndpointKey = 'apolloBatch' | 'attioSync' | 'recommendations' | 'apolloEnrich' | 'digestEmail' | 'sweepStuck';

const ENDPOINTS: Array<{ key: EndpointKey; label: string; desc: string; path: string; needsId?: boolean }> = [
	{
		key: 'apolloBatch',
		label: 'Apollo nightly batch',
		desc: 'Kick the Apollo enrichment batch sweep.',
		path: '/api/admin/integrations/apollo/batch',
	},
	{
		key: 'apolloEnrich',
		label: 'Apollo enrich investor',
		desc: 'Manually enrich a single investor — search and pick below.',
		path: '/api/admin/integrations/apollo/enrich',
		needsId: true,
	},
	{
		key: 'attioSync',
		label: 'Attio CRM sync',
		desc: 'Sync companies, investors, deals to Attio CRM now.',
		path: '/api/admin/integrations/attio/sync',
	},
	{
		key: 'recommendations',
		label: 'Recompute recommendations',
		desc: 'Re-score the recommendation engine immediately.',
		path: '/api/admin/jobs/recommendations/score',
	},
	{
		key: 'digestEmail',
		label: 'Send digest emails',
		desc: 'Run the digest-email job now (otherwise daily at 09:00 UTC).',
		path: '/api/admin/jobs/digest-email',
	},
	{
		key: 'sweepStuck',
		label: 'Sweep stuck jobs',
		desc: 'Re-queue jobs stuck past their timeout (otherwise every 5 min).',
		path: '/api/admin/jobs/sweep-stuck',
	},
];

export default function JobsPage() {
	const [enrichId, setEnrichId] = useState('');
	const [runningKey, setRunningKey] = useState<EndpointKey | null>(null);

	const run = async (endpoint: typeof ENDPOINTS[number]) => {
		setRunningKey(endpoint.key);
		try {
			const path = endpoint.needsId ? `${endpoint.path}/${enrichId}` : endpoint.path;
			const res = await api<{ jobLogId: string; bullJobId: string | null }>('POST', path);
			toast.success(`Queued ${endpoint.label}: job ${res.jobLogId.slice(0, 8)}`);
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setRunningKey(null);
		}
	};

	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
					Operations · {ENDPOINTS.length} jobs
				</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>Jobs & integrations</h1>
			</div>

			<div className="grid-2">
				{ENDPOINTS.map((e) => (
					<div key={e.key} className="card" style={{ padding: 'var(--space-4)' }}>
						<div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{e.label}</div>
						<div style={{ fontSize: 13, color: 'var(--fg-2)', marginBottom: 14 }}>{e.desc}</div>
						{e.needsId && (
							<div style={{ marginBottom: 10 }}>
								<InvestorSelectOne value={enrichId} onChange={setEnrichId} />
							</div>
						)}
						<button
							className="btn"
							disabled={runningKey === e.key || (e.needsId && !enrichId)}
							onClick={() => void run(e)}
						>
							{runningKey === e.key ? 'Queuing…' : 'Run now'}
						</button>
					</div>
				))}
			</div>
		</div>
	);
}
