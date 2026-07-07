'use client';

import { PageHeader } from '@/components/atoms';
import { ClaimsView } from '../../claims/page';

// STX: Ecosystem ▸ Investor claims.
export default function InvestorClaimsPage() {
	return (
		<div>
			<PageHeader kicker="Ecosystem" title="Investor claims" />
			<ClaimsView embedded lockType="investor" />
		</div>
	);
}
