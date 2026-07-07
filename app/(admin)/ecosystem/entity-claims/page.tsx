'use client';

import { PageHeader } from '@/components/atoms';
import { ClaimsView } from '../../claims/page';

// STX: Ecosystem ▸ Entity claims (programs / initiatives / events).
export default function EntityClaimsPage() {
	return (
		<div>
			<PageHeader kicker="Ecosystem" title="Entity claims" />
			<ClaimsView embedded lockType="ecosystem_entity" />
		</div>
	);
}
