'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';

export const NOTIFICATIONS_KEY = ['/api/admin/notifications'] as const;

interface Notice { id: string; kind: string; title: string; link: string | null; is_read: boolean; created_at: string; actor_email: string | null }

const ago = (iso: string): string => {
	const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
	if (s < 60) return 'just now';
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
	return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/**
 * Topbar bell: what raisers and scouters just did that needs an admin —
 * verification requests, data changes, Investor Circle opt-ins and deals,
 * intro requests. Read state is shared by the team. Live via the admin SSE
 * (`admin_notification` → revalidate this key); the slow poll only covers a
 * dropped stream.
 */
export function AdminNotifications() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const box = useRef<HTMLDivElement>(null);
	const { data, mutate } = useSWR<{ data: Notice[]; unread: number }>(NOTIFICATIONS_KEY, { refreshInterval: 120_000, dedupingInterval: 10_000 });
	const unread = data?.unread ?? 0;

	useEffect(() => {
		if (!open) return;
		const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
		const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
		document.addEventListener('mousedown', away);
		document.addEventListener('keydown', esc);
		return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
	}, [open]);

	const markRead = (ids: string[] | 'all') => {
		void mutate((d) => d && {
			data: d.data.map((n) => (ids === 'all' || ids.includes(n.id) ? { ...n, is_read: true } : n)),
			unread: ids === 'all' ? 0 : Math.max(0, d.unread - d.data.filter((n) => !n.is_read && ids.includes(n.id)).length),
		}, { revalidate: false });
		void (ids === 'all' ? api('POST', '/api/admin/notifications/read-all') : api('POST', `/api/admin/notifications/${ids[0]}/read`))
			.catch(() => undefined)
			.finally(() => void mutate());
	};

	const openNotice = (n: Notice) => {
		if (!n.is_read) markRead([n.id]);
		setOpen(false);
		if (n.link) router.push(n.link);
	};

	return (
		<div className="admin-notif" ref={box}>
			<button
				type="button"
				className="btn ghost admin-notif__bell"
				aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
				aria-expanded={open}
				onClick={() => setOpen((v) => !v)}
			>
				<Bell size={15} />
				{unread > 0 && <span className="admin-notif__count">{unread > 99 ? '99+' : unread}</span>}
			</button>
			{open && (
				<div className="admin-notif__panel card" role="dialog" aria-label="Notifications">
					<div className="admin-notif__head">
						<span>Notifications</span>
						{unread > 0 && <button type="button" className="admin-notif__all" onClick={() => markRead('all')}>Mark all read</button>}
					</div>
					{!data ? (
						<div className="admin-notif__empty">Loading…</div>
					) : data.data.length === 0 ? (
						<div className="admin-notif__empty">Nothing yet. Verification requests, data changes, Investor Circle requests and intro requests show up here.</div>
					) : (
						<ul className="admin-notif__list">
							{data.data.map((n) => (
								<li key={n.id}>
									<button type="button" className={`admin-notif__item${n.is_read ? '' : ' is-unread'}`} onClick={() => openNotice(n)}>
										<span className="admin-notif__dot" aria-hidden="true" />
										<span className="admin-notif__text">
											<span className="admin-notif__title">{n.title}</span>
											<span className="admin-notif__meta">{ago(n.created_at)}{n.actor_email ? ` · ${n.actor_email}` : ''}</span>
										</span>
									</button>
								</li>
							))}
						</ul>
					)}
				</div>
			)}
		</div>
	);
}
