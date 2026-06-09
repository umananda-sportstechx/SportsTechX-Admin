'use client';

import { useEffect, useRef, useState } from 'react';
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
 */
export function WorkSessionTimer({ queue }: { queue: WorkQueue }) {
	const { data: active, mutate } = useSWR<Session | null>(
		[`/api/admin/work-sessions/active`, { queue }],
		{ revalidateOnFocus: false, dedupingInterval: 10_000 },
	);
	const [elapsed, setElapsed] = useState(0);
	const [busy, setBusy] = useState(false);
	const anchorRef = useRef<{ base: number; at: number } | null>(null);

	// When an open session is present, anchor the local clock to its persisted
	// duration + the wall time elapsed since the last server read. The interval
	// ticks the displayed value off that anchor — all clock reads + setState
	// happen in callbacks, never during render (keeps it pure + ref-safe).
	useEffect(() => {
		anchorRef.current = active ? { base: active.duration_seconds, at: Date.now() } : null;
	}, [active]);

	useEffect(() => {
		if (!active) return;
		const sync = () => { const a = anchorRef.current; if (a) setElapsed(a.base + (Date.now() - a.at) / 1000); };
		const t = setInterval(sync, 1000);
		const ping = setInterval(() => { void api('POST', '/api/admin/work-sessions/ping', { queue }).then(() => mutate()); }, 45_000);
		return () => { clearInterval(t); clearInterval(ping); };
	}, [active, queue, mutate]);

	const start = async () => { setBusy(true); try { await api('POST', '/api/admin/work-sessions/start', { queue }); await mutate(); } finally { setBusy(false); } };
	const stop = async () => { setBusy(true); try { await api('POST', '/api/admin/work-sessions/end', { queue }); await mutate(null); } finally { setBusy(false); } };

	return (
		<div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
			{active ? (
				<>
					<span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--pos)' }} title="Active session time">● {fmt(elapsed)}</span>
					<span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{active.items_completed} done</span>
					<button className="btn ghost" disabled={busy} onClick={() => void stop()}><Square size={12} /> Stop</button>
				</>
			) : (
				<button className="btn ghost" disabled={busy} onClick={() => void start()}><Play size={12} /> Start session</button>
			)}
		</div>
	);
}

/** Notify the active session that an item was completed (increments the counter). */
export function countWorkItem(queue: WorkQueue): void {
	void api('POST', '/api/admin/work-sessions/count', { queue }).catch(() => {});
}
