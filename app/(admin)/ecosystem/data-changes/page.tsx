'use client';

import { PageHeader } from '@/components/atoms';
import { DataRequestsView } from '../../data-requests/page';

// STX: Ecosystem ▸ Investor / entity data-change requests.
export default function EcosystemDataChangesPage() {
	return (
		<div>
			<PageHeader kicker="Ecosystem" title="Data changes" />
			<DataRequestsView embedded lockEntity="investor,ecosystem,investor_fund,investor_portfolio" />
		</div>
	);
}
