'use client';

import type { VisibleSection } from '../report-kit/types';
import { useLiveSectionData } from '../report-kit/live-data';
import { formatBig, formatDate } from '../report-kit/format';

/** deal_table — live funding / M&A deal table. Content: { deal_type, query }. */
export function DealTableSection({ section }: { section: VisibleSection }) {
	const dealType = (section.content.deal_type as string) ?? 'funding';
	const { ref, data, isLoading } = useLiveSectionData<Array<Record<string, unknown>>>(section.id);
	return (
		<div ref={ref}>
			{isLoading && <div style={{ padding: 14, color: 'var(--rk-fg-muted)' }}>Loading…</div>}
			{!isLoading && data && data.length > 0 && (
				<div style={{ overflowX: 'auto' }}>
					<table className="rk-table">
						<thead>
							<tr>
								<th>{dealType === 'ma' ? 'Acquiree' : 'Company'}</th>
								<th>{dealType === 'ma' ? 'Acquirer' : 'Lead investor'}</th>
								<th>Region</th>
								<th>Date</th>
								<th className="num">Amount</th>
							</tr>
						</thead>
						<tbody>
							{data.map((row) => (
								<tr key={row.id as string}>
									<td>{(row.acquiree as string) ?? (row.company_name as string) ?? '—'}</td>
									<td>{(row.acquirer as string) ?? (row.lead_investor as string) ?? '—'}</td>
									<td>{(row.region as string) ?? '—'}</td>
									<td>{formatDate((row.acquisition_date ?? row.announced_date) as string | null)}</td>
									<td className="num">{row.amount_usd ? `$${formatBig(Number(row.amount_usd))}` : '—'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
