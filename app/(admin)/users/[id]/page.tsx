'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { PageHeader, AsyncState } from '@/components/atoms';
import { ManagePanel } from '../manage-panel';

interface UserDetail {
	id: string;
	email: string | null;
	display_name: string | null;
	user_role: string | null;
	user_type: string | null;
	company_name: string | null;
	created_at: string;
	last_seen_at: string | null;
	is_trial?: boolean;
	trial_ends_at?: string | null;
	active_subscription?: boolean;
	login_count?: number;
}

export default function UserDetailsPage() {
	const params = useParams();
	const id = String(params.id);
	const { data: user, error, isLoading, mutate } = useSWR<UserDetail>([`/api/admin/users/${id}`], { dedupingInterval: 15_000 });

	const fmt = (s?: string | null) => (s ? new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');
	const meta = (label: string, value: React.ReactNode) => (
		<div><div className="co-stat-label">{label}</div><div style={{ fontSize: 13 }}>{value}</div></div>
	);

	return (
		<div>
			<Link href="/users" className="btn ghost" style={{ marginBottom: 14 }}>← All users</Link>
			<PageHeader kicker="User details" title={user?.display_name || user?.email || 'User'} />

			<AsyncState loading={isLoading} error={error} empty={!isLoading && !user} emptyMsg="User not found." onRetry={() => void mutate()}>
				{user && (
					<>
						{/* Identity header */}
						<div className="card" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
							<div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
								<span style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700 }}>{user.email}</span>
								<span className="tag">{user.user_type ?? 'free'}</span>
								{user.user_role === 'admin' && <span className="tag pos">admin</span>}
								{user.is_trial
									? <span className="tag warn">trial{user.trial_ends_at ? ` · ends ${fmt(user.trial_ends_at)}` : ''}</span>
									: user.active_subscription ? <span className="tag pos">paid</span> : null}
							</div>
							<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
								{meta('Name', user.display_name ?? '—')}
								{meta('Company', user.company_name ?? '—')}
								{meta('Logins', (user.login_count ?? 0).toLocaleString())}
								{meta('Joined', fmt(user.created_at))}
								{meta('Last seen', fmt(user.last_seen_at))}
								{meta('User ID', <code style={{ fontSize: 11 }}>{user.id}</code>)}
							</div>
						</div>

						{/* Management (tabbed: Access · Billing & credits · Personalization) */}
						<ManagePanel user={user} />
					</>
				)}
			</AsyncState>
		</div>
	);
}
