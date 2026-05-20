'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import {
	LayoutDashboard, Briefcase, Users, FilePlus, FileText, Database, Layers,
	Activity, ShoppingCart, LogOut, ShieldAlert, CreditCard,
} from 'lucide-react';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useIsAdmin, useUserProfile } from '@/hooks/use-user-profile';

const NAV = [
	{ href: '/dashboard', label: 'Overview', Icon: LayoutDashboard },
	{ href: '/claims', label: 'Claims', Icon: ShieldAlert },
	{ href: '/users', label: 'Users', Icon: Users },
	{ href: '/companies', label: 'Companies & deals', Icon: Briefcase },
	{ href: '/ecosystem', label: 'Ecosystem', Icon: Layers },
	{ href: '/reports', label: 'Reports', Icon: FileText },
	{ href: '/startups-pipeline', label: 'Startups pipeline', Icon: FilePlus },
	{ href: '/sales', label: 'Sales', Icon: ShoppingCart },
	{ href: '/billing', label: 'Billing tools', Icon: CreditCard },
	{ href: '/jobs', label: 'Jobs & integrations', Icon: Activity },
	{ href: '/data-requests', label: 'Data requests', Icon: Database },
	{ href: '/performance', label: 'Performance', Icon: Activity },
	{ href: '/analytics', label: 'Analytics', Icon: LayoutDashboard },
];

/**
 * Admin shell — auth-gated, admin-role-gated wrapper for every admin page.
 *
 *  - Redirects unauthenticated users to /login
 *  - Redirects non-admin users to /forbidden
 *  - Renders the rail + topbar + content layout
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
	const { session, loading: authLoading, signOut } = useAuthSession();
	const { isAdmin, isLoading: adminLoading } = useIsAdmin();
	const { data: profile } = useUserProfile();
	const router = useRouter();
	const pathname = usePathname();

	useEffect(() => {
		if (authLoading) return;
		if (!session) {
			router.replace('/login');
			return;
		}
		if (!adminLoading && !isAdmin) {
			router.replace('/forbidden');
		}
	}, [authLoading, session, adminLoading, isAdmin, router]);

	if (authLoading || adminLoading || !session || !isAdmin) {
		return (
			<div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
				<div style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)', fontSize: 12 }}>
					Loading admin…
				</div>
			</div>
		);
	}

	const initials = (profile?.display_name || profile?.email || 'A')
		.split(/\s+/)
		.map((w) => w[0])
		.slice(0, 2)
		.join('')
		.toUpperCase();

	return (
		<div style={{ minHeight: '100vh' }}>
			<aside
				style={{
					position: 'fixed',
					top: 0,
					left: 0,
					bottom: 0,
					width: 220,
					background: 'var(--bg-2)',
					borderRight: '1px solid var(--border)',
					padding: 'var(--space-4) 0',
					overflowY: 'auto',
					scrollbarGutter: 'stable',
					zIndex: 10,
				}}
			>
				<div style={{ padding: '0 var(--space-4) var(--space-4)' }}>
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
						SportsTechX
					</div>
					<div
						style={{
							fontFamily: 'var(--font-display)',
							fontSize: 18,
							fontWeight: 800,
							letterSpacing: '-0.02em',
						}}
					>
						Admin
					</div>
				</div>
				<nav style={{ display: 'flex', flexDirection: 'column', padding: '0 8px' }}>
					{NAV.map(({ href, label, Icon }) => {
						const active = pathname === href || pathname?.startsWith(`${href}/`);
						return (
							<Link
								key={href}
								href={href}
								style={{
									display: 'flex',
									alignItems: 'center',
									gap: 10,
									padding: '8px 12px',
									textDecoration: 'none',
									color: active ? 'var(--fg)' : 'var(--fg-2)',
									background: active ? 'var(--bg-3)' : 'transparent',
									fontSize: 13,
									fontWeight: active ? 600 : 500,
									borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
								}}
							>
								<Icon size={14} /> {label}
							</Link>
						);
					})}
				</nav>
			</aside>
			<main style={{ display: 'flex', flexDirection: 'column', marginLeft: 220, minHeight: '100vh' }}>
				<header
					style={{
						display: 'flex',
						alignItems: 'center',
						gap: 12,
						padding: '12px var(--space-4)',
						borderBottom: '1px solid var(--border)',
						height: 'var(--topbar-h)',
					}}
				>
					<div style={{ flex: 1 }} />
					<div
						style={{
							width: 32,
							height: 32,
							background: 'var(--accent)',
							color: 'var(--accent-fg)',
							display: 'grid',
							placeItems: 'center',
							fontFamily: 'var(--font-display)',
							fontWeight: 700,
							fontSize: 12,
						}}
					>
						{initials}
					</div>
					<button
						onClick={() => signOut().then(() => router.replace('/login'))}
						className="btn ghost"
						title="Sign out"
					>
						<LogOut size={12} /> Sign out
					</button>
				</header>
				<div style={{ flex: 1, padding: 'var(--space-5) var(--space-4)' }}>{children}</div>
			</main>
		</div>
	);
}
