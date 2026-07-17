'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { PageHeader, PillTabs, AsyncState } from '@/components/atoms';
import { CashDashboard } from '@/components/cash/dashboard';
import { CashLedger } from '@/components/cash/ledger';
import { CashUpload } from '@/components/cash/upload';

/**
 * Finance — the Cash module (mirrors the legacy STX-WebApp Finance group):
 *  · Dashboard  — cash forecast, collection gates, risks
 *  · Ledger     — encrypted cash_transactions CRUD
 *  · CSV Upload — Qonto importer with dedup + Expected→Actual matching
 * Gated on the server having CASH_ENC_KEY (GET /api/cash/access).
 */
const TABS = [
	{ key: 'dashboard', label: 'Cash Dashboard' },
	{ key: 'ledger', label: 'Ledger' },
	{ key: 'upload', label: 'CSV Upload' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export default function FinancePage() {
	const [tab, setTab] = useState<TabKey>('dashboard');
	const access = useSWR<{ ok: boolean }>(['/api/cash/access'], { dedupingInterval: 5 * 60_000 });

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

	const configured = access.data?.ok !== false;

	return (
		<div>
			<PageHeader kicker="Finance" title="Cash" subtitle="Cash position, forecast, ledger and bank-statement import." />
			{!configured ? (
				<div className="card" style={{ padding: 'var(--space-5)', textAlign: 'center', color: 'var(--fg-muted)' }}>
					<div style={{ fontWeight: 700, color: 'var(--fg)', marginBottom: 6 }}>Cash module not configured</div>
					Set <code>CASH_ENC_KEY</code> (32-byte base64) in the server environment to enable the encrypted cash ledger.
				</div>
			) : (
				<AsyncState loading={access.isLoading} error={access.error} empty={false}>
					<PillTabs tabs={TABS.map((t) => ({ key: t.key, label: t.label }))} value={tab} onChange={onTab} />
					<div style={{ marginTop: 'var(--space-4)' }}>
						{tab === 'dashboard' && <CashDashboard />}
						{tab === 'ledger' && <CashLedger />}
						{tab === 'upload' && <CashUpload />}
					</div>
				</AsyncState>
			)}
		</div>
	);
}
