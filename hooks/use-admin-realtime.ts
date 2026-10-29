'use client';

import { useEffect } from 'react';
import { useSWRConfig } from 'swr';
import { getSupabaseBrowser } from '@/lib/supabase';

/**
 * Opens the backend SSE stream (/api/events) with the admin's bearer token and
 * revalidates the relevant SWR caches when the server broadcasts a change.
 * `pipeline_synced` (Attio webhook → sync) → refresh the Revenue Tracker;
 * `admin_notification` → refresh the topbar bell.
 *
 * Uses a raw fetch reader (EventSource can't send an Authorization header) with
 * simple auto-reconnect — no extra dependency.
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function useAdminRealtime(): void {
	const { mutate } = useSWRConfig();
	useEffect(() => {
		let stopped = false;
		let ctrl: AbortController | null = null;
		// Exponential backoff so a persistently-failing stream (proxy/Redis hiccup,
		// an env where /api/events isn't reachable) reconnects at 4s→8s→…→60s
		// instead of hammering a failed request every 4s forever. Reset on connect.
		let backoff = 4_000;
		const bump = () => { backoff = Math.min(backoff * 2, 60_000); };

		const onEvent = (type: string): void => {
			// A user did something an admin has to act on (or another admin read one).
			if (type === 'admin_notification') {
				void mutate((key) => Array.isArray(key) && key[0] === '/api/admin/notifications');
			}
			if (type === 'pipeline_synced') {
				void mutate((key) => Array.isArray(key) && String(key[0]).startsWith('/api/admin/revenue-tracker'));
			}
		};

		const run = async (): Promise<void> => {
			while (!stopped) {
				try {
					const { data: { session } } = await getSupabaseBrowser().auth.getSession();
					const token = session?.access_token;
					if (!token) { await sleep(backoff); bump(); continue; }
					ctrl = new AbortController();
					const res = await fetch('/api/events', { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
					if (!res.ok || !res.body) { await sleep(backoff); bump(); continue; }
					backoff = 4_000; // connected — reset the backoff
					const reader = res.body.getReader();
					const dec = new TextDecoder();
					let buf = '';
					while (!stopped) {
						const { value, done } = await reader.read();
						if (done) break;
						buf += dec.decode(value, { stream: true });
						const frames = buf.split('\n\n');
						buf = frames.pop() ?? '';
						for (const frame of frames) {
							let ev = 'message';
							for (const line of frame.split('\n')) if (line.startsWith('event:')) ev = line.slice(6).trim();
							if (ev !== 'heartbeat' && ev !== 'connected') onEvent(ev);
						}
					}
				} catch { /* network/abort — reconnect */ }
				if (!stopped) { await sleep(backoff); bump(); }
			}
		};
		void run();
		return () => { stopped = true; ctrl?.abort(); };
	}, [mutate]);
}
