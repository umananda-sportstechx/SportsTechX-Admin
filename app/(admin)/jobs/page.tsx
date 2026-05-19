'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

type EndpointKey = 'apolloBatch' | 'attioSync' | 'embeddings' | 'recommendations' | 'apolloEnrich';

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
		desc: 'Manually enrich a single investor by UUID.',
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
		key: 'embeddings',
		label: 'Embeddings backfill',
		desc: 'Embed missing rows in entity_embeddings (200 per kind).',
		path: '/api/admin/jobs/embeddings/backfill',
	},
	{
		key: 'recommendations',
		label: 'Recompute recommendations',
		desc: 'Re-score the recommendation engine immediately.',
		path: '/api/admin/jobs/recommendations/score',
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
							<input
								className="search-input"
								style={{ width: '100%', marginBottom: 10 }}
								placeholder="Investor UUID…"
								value={enrichId}
								onChange={(ev) => setEnrichId(ev.target.value)}
							/>
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
