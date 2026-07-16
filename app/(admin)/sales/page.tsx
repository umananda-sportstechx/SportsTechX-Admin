'use client';

import { useEffect, useState } from 'react';
import { PageHeader, PillTabs } from '@/components/atoms';
import { RevenueTracker } from '@/components/sales/revenue-tracker';
import { RevenueEntry } from '@/components/sales/revenue-entry';
import { SalesStripe } from '@/components/sales/stripe';
import { TouchpointsBoard } from '@/components/touchpoints-board';

/**
 * Sales — one page, four sub-tabs (mirrors the legacy STX-WebApp Sales tab):
 *  · Sales Tracker — targets vs realized, per-product, pipeline, revenue mix
 *  · Sales Entry   — the sales_revenue ledger (CRUD + CSV + Attio search)
 *  · Touchpoints   — weekly outreach board (Weekly Log / Team View inside)
 *  · Stripe        — live Stripe revenue dashboard
 * The active tab is reflected in ?tab= so it survives a refresh and is linkable.
 */
const TABS = [
	{ key: 'tracker', label: 'Sales Tracker' },
	{ key: 'entry', label: 'Sales Entry' },
	{ key: 'touchpoints', label: 'Touchpoints' },
	{ key: 'stripe', label: 'Stripe' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const SUBTITLES: Record<TabKey, string> = {
	tracker: 'Targets vs realized revenue, per-product tracking, pipeline and mix.',
	entry: 'Revenue entries — product, audience, client and amount.',
	touchpoints: 'Shared weekly outreach board — daily touchpoints vs per-channel targets.',
	stripe: 'Live MRR / ARR, volume, churn and trial conversion from Stripe.',
};

export default function SalesPage() {
	const [tab, setTab] = useState<TabKey>('tracker');

	// Sync from ?tab= after mount (avoids a hydration mismatch), and write back on
	// change via the History API so refresh/deep-links land on the right sub-tab.
	useEffect(() => {
		const t = new URLSearchParams(window.location.search).get('tab');
		if (t && TABS.some((x) => x.key === t)) setTab(t as TabKey);
	}, []);
	const onTab = (t: TabKey) => {
		setTab(t);
		const url = new URL(window.location.href);
		url.searchParams.set('tab', t);
		window.history.replaceState(null, '', url.toString());
	};

	return (
		<div>
			<PageHeader kicker="Sales" title="Sales" subtitle={SUBTITLES[tab]} />
			<PillTabs tabs={TABS.map((t) => ({ key: t.key, label: t.label }))} value={tab} onChange={onTab} />
			<div style={{ marginTop: 'var(--space-4)' }}>
				{tab === 'tracker' && <RevenueTracker />}
				{tab === 'entry' && <RevenueEntry />}
				{tab === 'touchpoints' && <TouchpointsBoard embedded />}
				{tab === 'stripe' && <SalesStripe />}
			</div>
		</div>
	);
}
