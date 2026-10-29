'use client';
// GENERATED — copied from client/components/features/reports/sections/poll.tsx by scripts/sync-report-renderer.mjs. Edit the client file, then re-run the script.

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { VisibleSection } from '../report-kit/types';
import { RichText } from '../report-kit/tiptap';

interface PollResults {
	id: string; question: string; is_open: boolean; my_option_id: string | null;
	options: Array<{ option_id: string; label: string; votes: number }>;
}

/** poll — reader vote. Real content lives in report_polls (linked by poll_id). */
export function PollSection({ section }: { section: VisibleSection }) {
	const pollId = section.poll_id;
	const caption = section.content.caption ?? section.title;
	const { data, mutate } = useSWR<PollResults>(pollId ? `/api/reports/polls/${pollId}/results` : null);
	const [busy, setBusy] = useState(false);
	if (!pollId) return null;

	const voted = !!data?.my_option_id;
	const total = (data?.options ?? []).reduce((s, o) => s + o.votes, 0);

	const vote = async (optionId: string) => {
		if (busy || !data?.is_open) return;
		setBusy(true);
		try {
			await api('POST', `/api/reports/polls/${pollId}/vote`, { option_id: optionId });
			await mutate();
		} catch (e) { toast.error((e as Error).message); }
		finally { setBusy(false); }
	};

	return (
		<div style={{ borderRadius: 16, border: '1px solid var(--rk-border)', background: 'var(--rk-bg-card)', padding: 'clamp(24px, 3vw, 36px)' }}>
			<div style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--rk-accent)', marginBottom: 8 }}>Reader poll</div>
			{caption != null && <h3 style={{ margin: '0 0 18px', fontFamily: 'var(--rk-font-display)', fontSize: 'clamp(22px,2.6vw,32px)', color: 'var(--rk-title)' }}><RichText value={caption} inline /></h3>}
			<div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`, gap: 12 }}>
				{(data?.options ?? []).map((o) => {
					const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0;
					const mine = data?.my_option_id === o.option_id;
					return (
						<button key={o.option_id} type="button" disabled={busy || !data?.is_open} onClick={() => void vote(o.option_id)}
							style={{ position: 'relative', overflow: 'hidden', textAlign: 'left', padding: '18px 20px', borderRadius: 12, cursor: data?.is_open ? 'pointer' : 'default', border: `1.5px solid ${mine ? 'var(--rk-accent)' : 'var(--rk-border)'}`, background: 'var(--rk-bg)', color: 'var(--rk-fg)' }}>
							{voted && <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'color-mix(in srgb, var(--rk-accent) 14%, transparent)', transition: 'width .6s ease' }} />}
							<div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
								<span style={{ fontWeight: 600, fontSize: 14 }}>{o.label}{mine ? ' ✓' : ''}</span>
								{voted && <span style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 14, color: 'var(--rk-accent)' }}>{pct}%</span>}
							</div>
						</button>
					);
				})}
			</div>
			{voted && <div style={{ marginTop: 12, fontFamily: 'var(--rk-font-mono)', fontSize: 11, color: 'var(--rk-fg-muted)' }}>{total.toLocaleString()} vote{total === 1 ? '' : 's'}</div>}
		</div>
	);
}
