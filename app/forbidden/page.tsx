'use client';

import { useRouter } from 'next/navigation';
import { useAuthSession } from '@/hooks/use-auth-session';

export default function ForbiddenPage() {
	const router = useRouter();
	const { signOut } = useAuthSession();
	return (
		<div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
			<div style={{ textAlign: 'center', maxWidth: 480 }}>
				<div
					style={{
						fontFamily: 'var(--font-mono)',
						fontSize: 10,
						color: 'var(--fg-muted)',
						textTransform: 'uppercase',
						letterSpacing: '0.12em',
						marginBottom: 4,
					}}
				>
					Access denied · 403
				</div>
				<h1
					style={{
						fontFamily: 'var(--font-display)',
						fontSize: 38,
						fontWeight: 800,
						letterSpacing: '-0.02em',
						lineHeight: 1,
						margin: '0 0 var(--space-3)',
					}}
				>
					You don&apos;t have admin access
				</h1>
				<p style={{ color: 'var(--fg-2)', marginBottom: 'var(--space-4)' }}>
					This area is restricted to SportsTechX administrators. Sign in with a different account if you have admin credentials.
				</p>
				<button
					className="btn"
					onClick={() => signOut().then(() => router.replace('/login'))}
				>
					Sign out & try another account
				</button>
			</div>
		</div>
	);
}
