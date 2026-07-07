'use client';

import { PageHeader } from '@/components/atoms';
import { DataRequestsView } from '../../data-requests/page';

// STX: Companies & Deals ▸ Company / Funding data-change requests.
export default function CompanyDataChangesPage() {
	return (
		<div>
			<PageHeader kicker="Companies & Deals" title="Data changes" />
			<DataRequestsView embedded lockEntity="company,deal" />
		</div>
	);
}
