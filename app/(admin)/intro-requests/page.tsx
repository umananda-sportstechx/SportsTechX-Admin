'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { PageHeader, AsyncState } from '@/components/atoms';
import { FilterBar, FilterSelect } from '@/components/filters';

interface IntroRequest {
	id: string;
	status: string;
	note: string | null;
	created_at: string;
	requester_name: string | null;
	requester_email: string | null;
	investor_name: string | null;
	investor_slug: string | null;
	company_name: string | null;
}
interface Resp { data: IntroRequest[] }

const STATUSES = ['requested', 'sent', 'declined'] as const;
const statusChip: Record<string, string> = { requested: 'warn', sent: 'on', declined: '' };

export default function IntroRequestsPage() {
	const [status, setStatus] = useState('');
	const [search, setSearch] = useState('');
	const debouncedSearch = useDebouncedValue(search);
	const [pending, setPending] = useState<string | null>(null);

	const { data, error, isLoading, mutate } = useSWR<Resp>(
		['/api/admin/intro-requests', { status: status || undefined, q: debouncedSearch || undefined, limit: 100 }],
		{ dedupingInterval: 15_000 },
	);
	const rows = data?.data ?? [];

	const setStatusFor = async (id: string, next: string) => {
		setPending(id);
		try {
			await api('PATCH', `/api/admin/intro-requests/${id}`, { status: next });
			toast.success(`Marked ${next}`);
			void mutate();
		} catch (e) { toast.error((e as Error).message); }
		finally { setPending(null); }
	};

	return (
		<div>
			<PageHeader
				kicker="Review queue"
				title="Intro requests"
				subtitle="Warm-intro requests from founders to matched investors. Action each: mark Sent once introduced, or Decline."
				action={<button className="btn ghost" onClick={() => void mutate()}><RefreshCw size={12} /> Refresh</button>}
			/>

			<FilterBar>
				<input
					className="search-input" style={{ flex: '0 0 280px', height: 32 }}
					placeholder="Search founder / investor…" value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
				<FilterSelect value={status} onChange={setStatus} allLabel="All statuses" options={STATUSES.map((s) => ({ value: s, label: s }))} />
			</FilterBar>

			<div className="card" style={{ padding: 'var(--space-4)' }}>
				<AsyncState loading={isLoading} error={error} empty={rows.length === 0} emptyMsg="No intro requests yet." onRetry={() => void mutate()}>
					<table className="data-table">
						<thead>
							<tr><th>When</th><th>Founder</th><th>Investor</th><th>Company</th><th>Note</th><th>Status</th><th>Actions</th></tr>
						</thead>
						<tbody>
							{rows.map((r) => (
								<tr key={r.id}>
									<td style={{ whiteSpace: 'nowrap', color: 'var(--fg-muted)', fontSize: 12 }}>{new Date(r.created_at).toLocaleDateString()}</td>
									<td>
										<div style={{ fontSize: 13 }}>{r.requester_name ?? '—'}</div>
										<div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{r.requester_email ?? ''}</div>
									</td>
									<td>{r.investor_name ?? '—'}</td>
									<td style={{ color: 'var(--fg-2)' }}>{r.company_name ?? '—'}</td>
									<td style={{ maxWidth: 280, fontSize: 12, color: 'var(--fg-2)' }}>{r.note ?? '—'}</td>
									<td><span className={`chip ${statusChip[r.status] ?? ''}`}>{r.status}</span></td>
									<td>
										<div style={{ display: 'flex', gap: 6 }}>
											<button className="btn" disabled={pending === r.id || r.status === 'sent'} onClick={() => void setStatusFor(r.id, 'sent')}>Sent</button>
											<button className="btn ghost" disabled={pending === r.id || r.status === 'declined'} onClick={() => void setStatusFor(r.id, 'declined')}>Decline</button>
											{r.status !== 'requested' && (
												<button className="btn ghost" disabled={pending === r.id} onClick={() => void setStatusFor(r.id, 'requested')}>Reset</button>
											)}
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</AsyncState>
			</div>
		</div>
	);
}
