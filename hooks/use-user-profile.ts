'use client';

import useSWR from 'swr';
import { useAuthSession } from './use-auth-session';

/**
 * Two separate concepts on the profile that get conflated easily:
 *
 *   - `user_role` — RBAC role: `'admin' | 'user'`. The server's @RequireRole
 *                   guard reads this; admin promote/demote endpoints flip it.
 *                   This is what gates the admin panel.
 *
 *   - `user_type` — Subscription tier: `'free' | 'growth' | 'pro'`. Drives
 *                   feature gating in the user-facing app, has nothing to do
 *                   with admin access.
 *
 * Earlier this hook checked `user_type === 'admin'` which is always false
 * because that column never holds 'admin'. Admin users got bounced to
 * /forbidden as a result.
 */
export interface Profile {
	id: string;
	email: string | null;
	display_name: string | null;
	user_role: string | null;
	user_type: string | null;
	avatar_url: string | null;
	company_name: string | null;
	job_title: string | null;
}

export function useUserProfile() {
	const { session, loading } = useAuthSession();
	const enabled = !loading && !!session;
	return useSWR<Profile>(enabled ? ['/api/profiles/me'] : null, {
		dedupingInterval: 5 * 60_000,
	});
}

export function useIsAdmin() {
	const { data: profile, isLoading } = useUserProfile();
	const isAdmin = profile?.user_role === 'admin';
	return { isAdmin, isLoading };
}
