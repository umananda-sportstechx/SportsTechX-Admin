'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import useSWR from 'swr';
import { ArrowLeft, Eye, Lock } from 'lucide-react';
import { SectionRenderer, type Section, type Tier } from '@/components/report-section-render';

/**
 * Preview-as-tier page for sections-based reports.
 *
 * Hits the SAME public endpoint a real user would
 * (`/api/reports/:id/sections`) with the admin-only `?as=free|growth|pro`
 * override, so what we render here is exactly what the server would return
 * to that tier. Admin JWT travels via the SWR auth header — the server
 * checks `Principal.isAdmin` before honouring `?as`.
 *
 * Uses the shared <SectionRenderer> so the visual surface matches the
 * public client app: hero with bg image, KPI grids, charts, blurred
 * lock-cards, all of it.
 */

const TIERS: Tier[] = ['free', 'growth', 'pro'];

export default function ReportPreviewPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = use(params);
	const [tier, setTier] = useState<Tier>('free');

	const { data, isLoading, error } = useSWR<{ data: Section[] }>(
		[`/api/reports/${id}/sections`, { as: tier }],
		{ dedupingInterval: 30_000 },
	);
	const sections = data?.data ?? [];
	const visibleCount = sections.filter((s) => !s.is_locked).length;
	const lockedCount = sections.filter((s) => s.is_locked).length;

	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 20, minHeight: 'calc(100vh - var(--topbar-h) - 40px)' }}>
			{/* ── Sticky tier-selector toolbar ─────────────────────────────── */}
			<div
				style={{
					position: 'sticky',
					top: 0,
					zIndex: 5,
					padding: '12px 0',
					background: 'var(--bg-1)',
					borderBottom: '1px solid var(--border)',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					gap: 12,
					flexWrap: 'wrap',
				}}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
					<Link href={`/reports/${id}`} className="btn ghost"><ArrowLeft size={12} /> Back to editor</Link>
					<div>
						<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
							Preview as
						</div>
						<div style={{ fontSize: 18, fontWeight: 700, textTransform: 'capitalize' }}>{tier} user</div>
					</div>
				</div>
				<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
					<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
						<Eye size={11} style={{ verticalAlign: -1 }} /> {visibleCount} visible
						{lockedCount > 0 && <> · <Lock size={11} style={{ verticalAlign: -1 }} /> {lockedCount} locked</>}
					</div>
					<div style={{ display: 'flex', gap: 4, padding: 4, background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
						{TIERS.map((t) => (
							<button
								key={t}
								onClick={() => setTier(t)}
								style={{
									padding: '6px 14px',
									background: tier === t ? 'var(--accent)' : 'transparent',
									color: tier === t ? 'var(--accent-fg)' : 'var(--fg)',
									border: 'none',
									cursor: 'pointer',
									fontWeight: 600,
									fontSize: 13,
									textTransform: 'capitalize',
								}}
							>
								{t}
							</button>
						))}
					</div>
				</div>
			</div>

			{/* ── Renderer ──────────────────────────────────────────────────── */}
			{error && (
				<div className="card" style={{ padding: 12, color: '#dc2626' }}>
					Failed to load: {(error as Error).message}
				</div>
			)}
			{isLoading && sections.length === 0 && <div className="card" style={{ padding: 12 }}>Loading…</div>}

			<div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900, width: '100%', margin: '0 auto' }}>
				{sections.map((s) => <SectionRenderer key={s.id} section={s} />)}
			</div>

			{!isLoading && sections.length === 0 && !error && (
				<div className="card" style={{ padding: 16, color: 'var(--fg-muted)', maxWidth: 900, margin: '0 auto' }}>
					No sections are visible to {tier} users. Either this report has no published sections, or all sections are gated above {tier}.
				</div>
			)}
		</div>
	);
}
