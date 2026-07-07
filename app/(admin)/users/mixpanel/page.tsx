'use client';

import { PageHeader } from '@/components/atoms';

// STX: User Analytics ▸ Mixpanel — embedded live product-analytics dashboard.
const MIXPANEL_EMBED = 'https://eu.mixpanel.com/p/7MkWY37CUE2uzv89QtV1YT?embed=true&passcode=Sportstechx%4012345';

export default function UsersMixpanelPage() {
	return (
		<div>
			<PageHeader kicker="User analytics" title="Mixpanel" subtitle="Live product analytics from Mixpanel." />
			<div className="card" style={{ padding: 0, overflow: 'hidden' }}>
				<iframe
					src={MIXPANEL_EMBED}
					title="Mixpanel Dashboard"
					style={{ width: '100%', height: '80vh', border: 0, display: 'block' }}
				/>
			</div>
		</div>
	);
}
