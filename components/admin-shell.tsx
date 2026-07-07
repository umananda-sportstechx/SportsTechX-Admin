'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
	LayoutDashboard, Briefcase, Users, FilePlus, FileText, Layers,
	Activity, ShoppingCart, LogOut, CreditCard, ToggleLeft,
	Banknote, Sparkles, Tag, BookOpen, Menu, BarChart3, Gauge,
	Lightbulb, Receipt, Package, Handshake, Download, Coins, Target, ChevronDown,
} from 'lucide-react';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useIsAdmin, useUserProfile } from '@/hooks/use-user-profile';

type IconType = typeof LayoutDashboard;
interface NavLeaf { href: string; label: string }
// A nav item is either a direct link (href) or a parent that expands into child
// pages (children). This mirrors the STX-WebApp admin, where each top tab that
// had its own sub-tabs becomes an expandable group whose sub-tabs are pages.
interface NavItem { href?: string; label: string; Icon: IconType; children?: NavLeaf[] }
interface NavGroup { label: string; items: NavItem[] }

// ── STX-mirrored structure ───────────────────────────────────────────────────
// Top-level entries follow STX's 12 admin tabs, in order. Tabs that had sub-tabs
// in STX (Companies & Deals, Ecosystem, Sales, Weekly Touchpoints, User Analytics)
// expand into child pages so the tab→sub-tab hierarchy lives in the sidebar.
const ADMIN_NAV: NavItem[] = [
	{ label: 'Dashboard', href: '/dashboard', Icon: LayoutDashboard },
	{
		label: 'Companies & Deals', Icon: Briefcase, children: [
			{ href: '/companies', label: 'Companies' },
			{ href: '/deals', label: 'Deals' },
			{ href: '/acquisitions', label: 'Acquisitions' },
			{ href: '/companies/claims', label: 'Claims' },
			{ href: '/companies/data-changes', label: 'Data changes' },
		],
	},
	{
		label: 'Ecosystem', Icon: Layers, children: [
			{ href: '/ecosystem', label: 'Programs & events' },
			{ href: '/investors', label: 'Investors' },
			{ href: '/ecosystem/investor-claims', label: 'Investor claims' },
			{ href: '/ecosystem/entity-claims', label: 'Entity claims' },
			{ href: '/ecosystem/data-changes', label: 'Data changes' },
		],
	},
	{ label: 'Startups to add', href: '/startups-pipeline', Icon: FilePlus },
	{ label: 'Investors to add', href: '/investor-review', Icon: Banknote },
	{
		label: 'Sales', Icon: ShoppingCart, children: [
			{ href: '/sales', label: 'Analytics' },
			{ href: '/sales/records', label: 'Records' },
		],
	},
	{
		label: 'Weekly touchpoints', Icon: Target, children: [
			{ href: '/touchpoints', label: 'Weekly log' },
			{ href: '/touchpoints/team', label: 'Team view' },
		],
	},
	{ label: 'Reports', href: '/reports', Icon: FileText },
	{ label: 'Featured lists', href: '/featured-lists', Icon: Sparkles },
	// User analytics gains its STX sub-tabs (Signups/Login/Reports/Mixpanel) next phase.
	{ label: 'User analytics', href: '/users', Icon: BarChart3 },
	{ label: 'Performance', href: '/performance', Icon: Gauge },
	{ label: 'Billing', href: '/billing', Icon: CreditCard },
];

// New-build features with no STX equivalent — kept, grouped separately.
const PLATFORM_NAV: NavItem[] = [
	{ label: 'Activity analytics', href: '/analytics', Icon: Activity },
	{ label: 'Reference data', href: '/reference', Icon: BookOpen },
	{ label: 'Intro requests', href: '/intro-requests', Icon: Handshake },
	{ label: 'Insights', href: '/insights', Icon: Lightbulb },
	{ label: 'Polls', href: '/polls', Icon: Sparkles },
	{ label: 'Plans', href: '/subscription-plans', Icon: Tag },
	{ label: 'Credit packs', href: '/credit-packs', Icon: Package },
	{ label: 'Feature flags', href: '/features', Icon: ToggleLeft },
	{ label: 'Jobs & integrations', href: '/jobs', Icon: Activity },
	{ label: 'AI usage & cost', href: '/ai-usage', Icon: Receipt },
	{ label: 'Credit usage', href: '/credit-usage', Icon: Coins },
	{ label: 'Export columns', href: '/exports', Icon: Download },
];

const NAV_GROUPS: NavGroup[] = [
	{ label: 'Admin', items: ADMIN_NAV },
	{ label: 'Platform tools', items: PLATFORM_NAV },
];

// Flat list of every reachable page (parents + children) for the topbar title.
const ALL_LEAVES: NavLeaf[] = NAV_GROUPS.flatMap((g) =>
	g.items.flatMap((it) => (it.children ? it.children : it.href ? [{ href: it.href, label: it.label }] : [])),
);

const leafActive = (pathname: string | null, href: string): boolean =>
	pathname === href || (!!pathname && pathname.startsWith(`${href}/`));

// The active leaf is the longest href that prefixes the current path, so a child
// page (/companies/claims) wins over its section root (/companies).
function activeLeafHref(pathname: string | null): string | null {
	const matches = ALL_LEAVES.filter((l) => leafActive(pathname, l.href));
	if (!matches.length) return null;
	return matches.sort((a, b) => b.href.length - a.href.length)[0].href;
}

/** One sidebar row — a direct link, or an expandable parent with child pages. */
function NavRow({ item, activeHref, onNavigate }: { item: NavItem; activeHref: string | null; onNavigate: () => void }) {
	const branchActive = !!item.children?.some((c) => c.href === activeHref);
	const [open, setOpen] = useState(branchActive);
	useEffect(() => { if (branchActive) setOpen(true); }, [branchActive]);

	if (!item.children) {
		return (
			<Link href={item.href!} className={`nav-link ${item.href === activeHref ? 'active' : ''}`} onClick={onNavigate}>
				<item.Icon size={15} /> {item.label}
			</Link>
		);
	}
	return (
		<div>
			<button
				type="button"
				className={`nav-link nav-parent ${branchActive ? 'branch' : ''}`}
				style={{ width: '100%', background: 'none', border: 0, font: 'inherit', cursor: 'pointer', textAlign: 'left' }}
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
			>
				<item.Icon size={15} />
				<span style={{ flex: 1 }}>{item.label}</span>
				<ChevronDown size={13} style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .15s', opacity: 0.7 }} />
			</button>
			{open && (
				<div style={{ margin: '2px 0 4px' }}>
					{item.children.map((c) => (
						<Link
							key={c.href}
							href={c.href}
							className={`nav-link nav-child ${c.href === activeHref ? 'active' : ''}`}
							style={{ paddingLeft: 34 }}
							onClick={onNavigate}
						>
							{c.label}
						</Link>
					))}
				</div>
			)}
		</div>
	);
}

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

	// Longest-prefix match so a child page (e.g. /companies/claims) wins over its
	// parent section (/companies) in the topbar title.
	const activeHref = activeLeafHref(pathname);
	const current = ALL_LEAVES.find((n) => n.href === activeHref);

	return (
		<div style={{ minHeight: '100vh' }}>
			<div className={`admin-scrim ${navOpen ? 'open' : ''}`} onClick={() => setNavOpen(false)} />

			<aside className={`admin-rail ${navOpen ? 'open' : ''}`}>
				<div className="admin-rail-brandrow">
					<div>
						<div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--sidebar-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>
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
							{group.items.map((item) => (
								<NavRow key={item.label} item={item} activeHref={activeHref} onNavigate={() => setNavOpen(false)} />
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
