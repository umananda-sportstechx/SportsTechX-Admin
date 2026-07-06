'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
	LayoutDashboard, Briefcase, Users, FilePlus, FileText, Database, Layers,
	Activity, ShoppingCart, LogOut, ShieldAlert, CreditCard, ToggleLeft,
	Banknote, Sparkles, Tag, BookOpen, Menu, BarChart3, Gauge,
	CircleDollarSign, GitMerge, Lightbulb, Receipt, Package, Handshake, Download, Coins,
} from 'lucide-react';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useIsAdmin, useUserProfile } from '@/hooks/use-user-profile';

interface NavItem { href: string; label: string; Icon: typeof LayoutDashboard }
interface NavGroup { label: string; items: NavItem[] }

// Grouped so 18 destinations stay scannable instead of one flat list.
const NAV_GROUPS: NavGroup[] = [
	{
		label: 'Overview',
		items: [
			{ href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
			{ href: '/analytics', label: 'Analytics', Icon: BarChart3 },
		],
	},
	{
		label: 'Review queues',
		items: [
			{ href: '/claims', label: 'Claims', Icon: ShieldAlert },
			{ href: '/data-requests', label: 'Data requests', Icon: Database },
			{ href: '/startups-pipeline', label: 'Startups pipeline', Icon: FilePlus },
			{ href: '/investor-review', label: 'Investor review', Icon: Banknote },
			{ href: '/intro-requests', label: 'Intro requests', Icon: Handshake },
		],
	},
	{
		label: 'Catalog',
		items: [
			{ href: '/companies', label: 'Companies', Icon: Briefcase },
			{ href: '/deals', label: 'Deals', Icon: CircleDollarSign },
			{ href: '/acquisitions', label: 'Acquisitions', Icon: GitMerge },
			{ href: '/investors', label: 'Investors', Icon: Banknote },
			{ href: '/ecosystem', label: 'Ecosystem', Icon: Layers },
			{ href: '/featured-lists', label: 'Featured lists', Icon: Sparkles },
			{ href: '/reference', label: 'Reference data', Icon: BookOpen },
		],
	},
	{
		label: 'Content',
		items: [
			{ href: '/reports', label: 'Reports', Icon: FileText },
			{ href: '/polls', label: 'Polls', Icon: Sparkles },
			{ href: '/insights', label: 'Insights', Icon: Lightbulb },
		],
	},
	{
		label: 'Growth & access',
		items: [
			{ href: '/users', label: 'Users', Icon: Users },
			{ href: '/billing', label: 'Billing tools', Icon: CreditCard },
			{ href: '/subscription-plans', label: 'Plans', Icon: Tag },
			{ href: '/credit-packs', label: 'Credit packs', Icon: Package },
			{ href: '/features', label: 'Feature flags', Icon: ToggleLeft },
		],
	},
	{
		label: 'Operations',
		items: [
			{ href: '/sales', label: 'Sales', Icon: ShoppingCart },
			{ href: '/jobs', label: 'Jobs & integrations', Icon: Activity },
			{ href: '/ai-usage', label: 'AI usage & cost', Icon: Receipt },
			{ href: '/credit-usage', label: 'Credit usage', Icon: Coins },
			{ href: '/exports', label: 'Export columns', Icon: Download },
			{ href: '/performance', label: 'Performance', Icon: Gauge },
		],
	},
];

const ALL_NAV = NAV_GROUPS.flatMap((g) => g.items);

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
	const [navOpen, setNavOpen] = useState(false);

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

	const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);
	const current = ALL_NAV.find((n) => isActive(n.href));

	return (
		<div style={{ minHeight: '100vh' }}>
			<div className={`admin-scrim ${navOpen ? 'open' : ''}`} onClick={() => setNavOpen(false)} />

			<aside className={`admin-rail ${navOpen ? 'open' : ''}`}>
				<div className="admin-rail-brandrow">
					<div>
						<div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>
							SportsTechX
						</div>
						<div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em' }}>
							Admin
						</div>
					</div>
				</div>
				<nav>
					{NAV_GROUPS.map((group) => (
						<div className="nav-group" key={group.label}>
							<div className="nav-group-label">{group.label}</div>
							{group.items.map(({ href, label, Icon }) => (
								<Link key={href} href={href} className={`nav-link ${isActive(href) ? 'active' : ''}`} onClick={() => setNavOpen(false)}>
									<Icon size={15} /> {label}
								</Link>
							))}
						</div>
					))}
				</nav>
			</aside>

			<main className="admin-main">
				<header className="admin-topbar">
					<button className="btn ghost admin-rail-toggle" onClick={() => setNavOpen((v) => !v)} aria-label="Toggle navigation">
						<Menu size={16} />
					</button>
					<div className="admin-topbar-title">{current?.label ?? 'Admin'}</div>
					<div style={{ flex: 1 }} />
					<div className="admin-avatar" title={profile?.email ?? undefined}>{initials}</div>
					<button onClick={() => signOut().then(() => router.replace('/login'))} className="btn ghost" title="Sign out">
						<LogOut size={12} /> Sign out
					</button>
				</header>
				<div style={{ flex: 1, padding: 'var(--space-5) var(--space-4)' }}>
					<div className="admin-content">{children}</div>
				</div>
			</main>
		</div>
	);
}
