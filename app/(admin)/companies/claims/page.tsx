'use client';

import { PageHeader } from '@/components/atoms';
import { ClaimsView } from '../../claims/page';

// STX: Companies & Deals ▸ Claims (company ownership claims).
export default function CompanyClaimsPage() {
	return (
		<div>
			<PageHeader kicker="Companies & Deals" title="Claims" />
			<ClaimsView embedded lockType="company" />
		</div>
	);
}
