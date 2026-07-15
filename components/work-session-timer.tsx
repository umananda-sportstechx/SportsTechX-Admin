'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { Play, Square } from 'lucide-react';
import { api } from '@/lib/api';

export type WorkQueue = 'investor_review' | 'startups_pipeline';

interface Session { id: string; started_at: string; duration_seconds: number; items_completed: number }

function fmt(seconds: number): string {
	const s = Math.max(0, Math.floor(seconds));
	const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
	return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

/**
 * Reviewer work-session timer for a curation queue. Start opens a session,
 * pings every 45s to accumulate active time, Stop closes it. The displayed
 * clock ticks locally off the persisted base so it stays smooth between pings.
 * Idle → a compact "Start session" pill; active → a prominent progress banner.
 */
export function WorkSessionTimer({ queue }: { queue: WorkQueue }) {
	const { data: active, mutate } = useSWR<Session | null>(
		[`/api/admin/work-sessions/active`, { queue }],
		{ revalidateOnFocus: false, dedupingInterval: 10_000 },
	);
	const [elapsed, setElapsed] = useState(0);
	const [busy, setBusy] = useState(false);

	// Display wall-clock time since the session STARTED (persisted server-side),
	// so the clock stays consistent across page navigation / refresh. (The
	// idle-capped active-time is still accumulated server-side via ping for the
	// stats — but showing it here made the clock appear to reset on reload.)
	useEffect(() => {
		if (!active) return;
		const startMs = new Date(active.started_at).getTime();
		const sync = () => setElapsed(Math.max(0, (Date.now() - startMs) / 1000));
		sync();
		const t = setInterval(sync, 1000);
		const ping = setInterval(() => { void api('POST', '/api/admin/work-sessions/ping', { queue }).then(() => mutate()); }, 45_000);
		return () => { clearInterval(t); clearInterval(ping); };
	}, [active, queue, mutate]);

	const start = async () => { setBusy(true); try { await api('POST', '/api/admin/work-sessions/start', { queue }); await mutate(); } finally { setBusy(false); } };
	const stop = async () => { setBusy(true); try { await api('POST', '/api/admin/work-sessions/end', { queue }); await mutate(null); } finally { setBusy(false); } };

	if (active) {
		return (
			<div style={{
				width: '100%', display: 'flex', alignItems: 'center', gap: 16,
				padding: '12px 18px', borderRadius: 12,
				border: '1px solid color-mix(in srgb, var(--pos) 40%, var(--border))',
				background: 'color-mix(in srgb, var(--pos) 12%, transparent)',
			}}>
				<span style={{ width: 10, height: 10, borderRadius: 999, background: 'var(--pos)', boxShadow: '0 0 0 4px color-mix(in srgb, var(--pos) 22%, transparent)', flexShrink: 0 }} />
				<div>
					<div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--pos)' }}>Session in progress</div>
					<div style={{ fontFamily: 'var(--font-mono)', fontSize: 24, fontWeight: 700, lineHeight: 1.1 }}>{fmt(elapsed)}</div>
				</div>
				<div style={{ flex: 1 }} />
				<div style={{ textAlign: 'right' }}>
					<div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{active.items_completed}</div>
					<div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>completed</div>
				</div>
				<button className="btn" disabled={busy} onClick={() => void stop()} style={{ background: 'var(--neg, #c0392b)', borderColor: 'transparent', color: '#fff' }}><Square size={12} /> Stop session</button>
			</div>
		);
	}

	return (
		<div style={{
			display: 'inline-flex', alignItems: 'center', gap: 10,
			padding: '6px 6px 6px 12px', border: '1px solid var(--border)', borderRadius: 999, background: 'var(--bg-2)',
		}}>
			<span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Track your review time</span>
			<button className="btn" disabled={busy} onClick={() => void start()} style={{ fontWeight: 600 }}><Play size={14} /> Start session</button>
		</div>
	);
}

/** Notify the active session that an item was completed (increments the counter). */
export function countWorkItem(queue: WorkQueue): void {
	void api('POST', '/api/admin/work-sessions/count', { queue }).catch(() => {});
}
