'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabaseBrowser } from '@/lib/supabase';

interface AuthSession {
	session: Session | null;
	loading: boolean;
	signOut: () => Promise<void>;
}

const AuthSessionContext = createContext<AuthSession>({
	session: null,
	loading: true,
	signOut: async () => {},
});

export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const supabase = getSupabaseBrowser();
		supabase.auth.getSession().then(({ data }: { data: { session: Session | null } }) => {
			setSession(data.session);
			setLoading(false);
		});
		const { data: sub } = supabase.auth.onAuthStateChange((_event: string, s: Session | null) => {
			setSession(s);
			setLoading(false);
		});
		return () => sub.subscription.unsubscribe();
	}, []);

	const signOut = async () => {
		await getSupabaseBrowser().auth.signOut();
		setSession(null);
	};

	return (
		<AuthSessionContext.Provider value={{ session, loading, signOut }}>
			{children}
		</AuthSessionContext.Provider>
	);
}

export function useAuthSession() {
	return useContext(AuthSessionContext);
}
