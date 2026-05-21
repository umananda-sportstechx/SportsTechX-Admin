'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import useSWR from 'swr';
import { Lock, ArrowRight, ExternalLink } from 'lucide-react';
import {
	BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
	XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';

/**
 * Visual renderer for report sections — the in-app preview surface.
 *
 * Near-mirror of the public client renderer (client/app/(app)/reports/
 * [idOrSlug]/page.tsx). Kept as a parallel implementation in admin because
 * the two apps are independent Next builds with separate dependency trees;
 * sharing through a workspace package is a v2 cleanup. If you touch one,
 * touch the other unless you want preview/prod to diverge.
 *
 * Used by the [id]/preview page to render exactly what each tier sees,
 * with the same blurred lock-cards, live-data fetches, and rich text.
 */

// ─── Types matching the server `/sections` response ─────────────────────────

export type Tier = 'free' | 'growth' | 'pro';

interface BaseSection {
	id: string;
	report_id: string;
	kind: string;
	position: number;
	access_tier: Tier;
	title: string | null;
	slug: string | null;
}
export interface VisibleSection extends BaseSection {
	is_locked: false;
	is_published: boolean;
	is_live_data: boolean;
	content: Record<string, unknown>;
	poll_id: string | null;
}
export interface LockedSection extends BaseSection {
	is_locked: true;
	preview: string;
	content: null;
}
export type Section = VisibleSection | LockedSection;

// ─── Section dispatcher ─────────────────────────────────────────────────────

export function SectionRenderer({ section }: { section: Section }) {
	if (section.is_locked) return <LockedCard section={section} />;
	switch (section.kind) {
		case 'hero':            return <HeroSection content={section.content} />;
		case 'narrative':       return <NarrativeSection content={section.content} />;
		case 'kpi_grid':        return <KpiGridSection content={section.content} />;
		case 'trend_card_list': return <TrendCardListSection content={section.content} />;
		case 'company_grid':    return <CompanyGridSection section={section} />;
		case 'deal_table':      return <DealTableSection section={section} />;
		case 'data_chart':      return <DataChartSection section={section} />;
		case 'poll':            return <PollPlaceholder section={section} />;
		case 'quote':           return <QuoteSection content={section.content} />;
		case 'embed':           return <EmbedSection content={section.content} />;
		case 'ecosystem_map':   return <EcosystemMapSection section={section} />;
		default:
			return <div className="card" style={{ padding: 12, color: 'var(--fg-muted)' }}>Unknown kind: <code>{section.kind}</code></div>;
	}
}

// ─── Locked card (blur preview) ─────────────────────────────────────────────

function LockedCard({ section }: { section: LockedSection }) {
	const tierLabel = section.access_tier[0].toUpperCase() + section.access_tier.slice(1);
	return (
		<div
			className="card"
			style={{
				padding: 'var(--space-4)',
				position: 'relative',
				background: 'linear-gradient(180deg, var(--bg-1) 0%, var(--bg-2) 100%)',
				borderColor: section.access_tier === 'pro' ? '#fbbf24' : '#60a5fa',
			}}
		>
			<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
				<Lock size={14} />
				<span style={{
					fontFamily: 'var(--font-mono)', fontSize: 11, textTransform: 'uppercase',
					letterSpacing: '0.1em', color: section.access_tier === 'pro' ? '#d97706' : '#0284c7',
				}}>
					{tierLabel} only
				</span>
			</div>
			<h3 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 700 }}>
				{section.title ?? `(${section.kind} section)`}
			</h3>
			<div style={{ position: 'relative', overflow: 'hidden', maxHeight: 100 }}>
				<p style={{
					margin: 0, color: 'var(--fg-2)', fontSize: 14,
					filter: 'blur(4px)', userSelect: 'none', pointerEvents: 'none',
				}}>
					{section.preview || 'Locked content.'}
				</p>
				<div style={{
					position: 'absolute', inset: 0, pointerEvents: 'none',
					background: 'linear-gradient(180deg, transparent 0%, var(--bg-1) 90%)',
				}} />
			</div>
			<button
				className="btn"
				style={{ marginTop: 12 }}
				onClick={() => alert('Preview mode — Upgrade button would route to /subscriptions for real users.')}
			>
				Upgrade to {tierLabel} <ArrowRight size={12} />
			</button>
		</div>
	);
}

// ─── Per-kind static renderers ──────────────────────────────────────────────

function HeroSection({ content }: { content: Record<string, unknown> }) {
	const subtitle = content.subtitle;
	const kpis = (content.kpis as Array<{ label: unknown; value: unknown; delta?: string }>) ?? [];
	const coverUrl = content.cover_url as string | undefined;
	return (
		<div
			className="card"
			style={{
				padding: 'var(--space-5)', borderRadius: 12,
				background: coverUrl
					? `linear-gradient(180deg, rgba(15,23,42,0.85) 0%, rgba(15,23,42,0.95) 100%), url(${coverUrl}) center / cover`
					: 'var(--bg-2)',
				color: coverUrl ? '#fff' : undefined,
			}}
		>
			{subtitle != null && (
				<p style={{ fontSize: 17, lineHeight: 1.5, margin: '0 0 16px', opacity: 0.92 }}>
					<RichText value={subtitle} inline />
				</p>
			)}
			{kpis.length > 0 && (
				<div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(kpis.length, 4)}, 1fr)`, gap: 16 }}>
					{kpis.map((k, i) => (
						<div key={i}>
							<div style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}><RichText value={k.value} inline /></div>
							<div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}><RichText value={k.label} inline /></div>
							{k.delta && <div style={{ fontSize: 11, marginTop: 2, color: k.delta.startsWith('-') ? '#fca5a5' : '#86efac' }}>{k.delta}</div>}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function NarrativeSection({ content }: { content: Record<string, unknown> }) {
	return (
		<section style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--fg)' }}>
			<TiptapRenderer doc={content.doc} />
		</section>
	);
}

function KpiGridSection({ content }: { content: Record<string, unknown> }) {
	const columns = (content.columns as number) ?? 3;
	const items = (content.items as Array<{ label: unknown; value: unknown; hint?: unknown }>) ?? [];
	return (
		<div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 12 }}>
			{items.map((it, i) => (
				<div key={i} className="card" style={{ padding: 'var(--space-3)' }}>
					<div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.1 }}><RichText value={it.value} inline /></div>
					<div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}><RichText value={it.label} inline /></div>
					{it.hint != null && <div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4 }}><RichText value={it.hint} inline /></div>}
				</div>
			))}
		</div>
	);
}

function TrendCardListSection({ content }: { content: Record<string, unknown> }) {
	const items = (content.items as Array<{
		title: unknown;
		body: Record<string, unknown>;
		table?: { headers: string[]; rows: string[][] };
	}>) ?? [];
	return (
		<div style={{ display: 'grid', gap: 16 }}>
			{items.map((it, i) => (
				<div key={i} className="card" style={{ padding: 'var(--space-4)' }}>
					<h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}><RichText value={it.title} inline /></h3>
					<div style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--fg-2)' }}>
						<TiptapRenderer doc={it.body} />
					</div>
					{it.table && it.table.rows.length > 0 && (
						<table className="data-table" style={{ marginTop: 16 }}>
							<thead><tr>{it.table.headers.map((h, j) => <th key={j}>{h}</th>)}</tr></thead>
							<tbody>
								{it.table.rows.map((row, ri) => (
									<tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
								))}
							</tbody>
						</table>
					)}
				</div>
			))}
		</div>
	);
}

function QuoteSection({ content }: { content: Record<string, unknown> }) {
	const author = content.author;
	const role = content.role;
	const avatarUrl = content.avatar_url as string | undefined;
	return (
		<blockquote className="card" style={{
			padding: 'var(--space-4)', borderLeft: '3px solid var(--accent)',
			fontStyle: 'italic', margin: 0, fontSize: 17, lineHeight: 1.6,
		}}>
			<div style={{ marginBottom: 12 }}><TiptapRenderer doc={content.body} /></div>
			<footer style={{ display: 'flex', alignItems: 'center', gap: 10, fontStyle: 'normal', fontSize: 13 }}>
				{avatarUrl && (
					/* eslint-disable-next-line @next/next/no-img-element */
					<img src={avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: '50%' }} />
				)}
				<div>
					<div style={{ fontWeight: 700 }}><RichText value={author} inline /></div>
					{role != null && <div style={{ color: 'var(--fg-muted)', fontSize: 12 }}><RichText value={role} inline /></div>}
				</div>
			</footer>
		</blockquote>
	);
}

function EmbedSection({ content }: { content: Record<string, unknown> }) {
	const url = (content.url as string) ?? '';
	const provider = (content.provider as string) ?? 'iframe';
	const caption = content.caption;
	const embedUrl = (() => {
		if (provider === 'youtube') {
			const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
			return m ? `https://www.youtube.com/embed/${m[1]}` : url;
		}
		if (provider === 'vimeo') {
			const m = url.match(/vimeo\.com\/(\d+)/);
			return m ? `https://player.vimeo.com/video/${m[1]}` : url;
		}
		return url;
	})();
	return (
		<div>
			<div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
				<iframe
					src={embedUrl}
					style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
					allowFullScreen
					sandbox="allow-scripts allow-same-origin allow-presentation"
				/>
			</div>
			{caption != null && (
				<p style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 6, textAlign: 'center' }}>
					<RichText value={caption} inline />
				</p>
			)}
		</div>
	);
}

function PollPlaceholder({ section }: { section: VisibleSection }) {
	// Voting in preview is intentionally a no-op — admin shouldn't pollute
	// real vote tallies while previewing. We render the structure so layout is
	// faithful.
	const caption = section.content.caption ?? section.title;
	return (
		<div className="card" style={{ padding: 'var(--space-4)' }}>
			<div style={{
				fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)',
				textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6,
			}}>
				Reader poll · preview
			</div>
			<h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>
				{caption != null ? <RichText value={caption} inline /> : 'Reader poll'}
			</h3>
			<p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
				Vote widget renders on the public site. Poll ID: <code>{section.poll_id ?? '—'}</code>
			</p>
		</div>
	);
}

// ─── Live-data sections ─────────────────────────────────────────────────────

function useLiveSectionData<T = unknown>(sectionId: string) {
	const ref = useRef<HTMLDivElement>(null);
	const [shouldLoad, setShouldLoad] = useState(false);
	useEffect(() => {
		if (shouldLoad) return;
		const el = ref.current;
		if (!el) return;
		const io = new IntersectionObserver((entries) => {
			for (const e of entries) {
				if (e.isIntersecting) {
					setShouldLoad(true);
					io.disconnect();
					break;
				}
			}
		}, { rootMargin: '200px' });
		io.observe(el);
		return () => io.disconnect();
	}, [shouldLoad]);

	const { data, error, isLoading } = useSWR<{ data: T }>(
		shouldLoad ? [`/api/reports/sections/${sectionId}/data`] : null,
		{ revalidateOnFocus: false, dedupingInterval: 300_000 },
	);
	return { ref, data: data?.data, error, isLoading: shouldLoad && isLoading };
}

function LiveSectionShell({
	title, refEl, children,
}: { title?: unknown; refEl: React.RefObject<HTMLDivElement | null>; children: ReactNode }) {
	return (
		<section ref={refEl}>
			{title != null && <h3 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 700 }}><RichText value={title} inline /></h3>}
			{children}
		</section>
	);
}

function CompanyGridSection({ section }: { section: VisibleSection }) {
	const c = section.content;
	const mode = (c.mode as string) ?? 'static';
	const heading = section.title ?? c.tab_label;
	if (mode === 'static') {
		return <StaticCompanyGrid companyIds={(c.company_ids as string[]) ?? []} title={heading} />;
	}
	return <LiveCompanyGrid section={section} heading={heading} />;
}

function StaticCompanyGrid({ companyIds, title }: { companyIds: string[]; title: unknown }) {
	const idsCsv = companyIds.length > 0 ? companyIds.join(',') : null;
	const { data, isLoading } = useSWR<{ data: Array<{
		id: string; name: string; slug: string | null; custom_logo_url: string | null;
		primary_sector: string | null; hq_country: string | null; total_funding_usd: string | null;
	}> }>(
		idsCsv ? [`/api/companies`, { ids: idsCsv, limit: companyIds.length }] : null,
		{ dedupingInterval: 5 * 60_000 },
	);
	const byId = new Map((data?.data ?? []).map((c) => [c.id, c] as const));
	const sorted = companyIds.map((id) => byId.get(id)).filter(Boolean) as Array<NonNullable<ReturnType<typeof byId.get>>>;

	return (
		<section>
			{title != null && <h3 style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 700 }}><RichText value={title} inline /></h3>}
			{isLoading && <div className="card" style={{ padding: 12 }}>Loading…</div>}
			{!isLoading && sorted.length === 0 && companyIds.length > 0 && (
				<div className="card" style={{ padding: 12, color: 'var(--fg-muted)' }}>
					None of the curated companies could be loaded.
				</div>
			)}
			{sorted.length > 0 && (
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
					{sorted.map((c) => (
						<Link
							key={c.id}
							href={`/companies/${c.slug ?? c.id}`}
							className="card"
							style={{ padding: 'var(--space-3)', textDecoration: 'none', color: 'inherit', display: 'block' }}
						>
							{c.custom_logo_url && (
								/* eslint-disable-next-line @next/next/no-img-element */
								<img src={c.custom_logo_url} alt="" style={{ width: 28, height: 28, objectFit: 'contain', marginBottom: 8 }} />
							)}
							<div style={{ fontWeight: 600, marginBottom: 4 }}>{c.name}</div>
							<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
								{c.primary_sector ?? '—'}{c.hq_country ? ` · ${c.hq_country}` : ''}
							</div>
							{c.total_funding_usd && (
								<div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4 }}>
									${formatBig(Number(c.total_funding_usd))} raised
								</div>
							)}
						</Link>
					))}
				</div>
			)}
		</section>
	);
}

function LiveCompanyGrid({ section, heading }: { section: VisibleSection; heading: unknown }) {
	const { ref, data, isLoading } = useLiveSectionData<Array<{
		id: string; name: string; slug: string | null; website: string | null;
		custom_logo_url: string | null; sector_name: string | null; country: string | null;
		total_funding_usd: string | null;
	}>>(section.id);
	return (
		<LiveSectionShell title={heading} refEl={ref}>
			{isLoading && <div className="card" style={{ padding: 12 }}>Loading…</div>}
			{!isLoading && data && (
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
					{data.map((c) => (
						<div key={c.id} className="card" style={{ padding: 'var(--space-3)' }}>
							<div style={{ fontWeight: 600, marginBottom: 4 }}>{c.name}</div>
							<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
								{c.sector_name ?? '—'}{c.country ? ` · ${c.country}` : ''}
							</div>
							{c.total_funding_usd && (
								<div style={{ fontSize: 11, color: 'var(--fg-2)', marginTop: 4 }}>
									${formatBig(Number(c.total_funding_usd))} raised
								</div>
							)}
						</div>
					))}
				</div>
			)}
		</LiveSectionShell>
	);
}

function DealTableSection({ section }: { section: VisibleSection }) {
	const dealType = (section.content.deal_type as string) ?? 'funding';
	const { ref, data, isLoading } = useLiveSectionData<Array<Record<string, unknown>>>(section.id);
	return (
		<LiveSectionShell title={section.title} refEl={ref}>
			{isLoading && <div className="card" style={{ padding: 12 }}>Loading…</div>}
			{!isLoading && data && data.length > 0 && (
				<table className="data-table">
					<thead>
						<tr>
							<th>{dealType === 'ma' ? 'Acquiree' : 'Company'}</th>
							<th>{dealType === 'ma' ? 'Acquirer' : 'Lead investor'}</th>
							<th>Region</th>
							<th>Date</th>
							<th className="num">Amount</th>
						</tr>
					</thead>
					<tbody>
						{data.map((row) => (
							<tr key={row.id as string}>
								<td>{(row.acquiree as string) ?? (row.company_name as string) ?? '—'}</td>
								<td>{(row.acquirer as string) ?? (row.lead_investor as string) ?? '—'}</td>
								<td>{(row.region as string) ?? '—'}</td>
								<td>{formatDate((row.acquisition_date ?? row.announced_date) as string | null)}</td>
								<td className="num">{row.amount_usd ? `$${formatBig(Number(row.amount_usd))}` : '—'}</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</LiveSectionShell>
	);
}

function DataChartSection({ section }: { section: VisibleSection }) {
	const chartType = (section.content.chart_type as string) ?? 'bar';
	const metric = (section.content.metric as string) ?? 'funding_by_year';
	const { ref, data, isLoading } = useLiveSectionData<Array<Record<string, unknown>>>(section.id);
	const { xKey, yKey, labelKey } = (() => {
		if (metric === 'funding_by_year' || metric === 'ma_by_year') return { xKey: 'year', yKey: 'total', labelKey: 'year' };
		if (metric === 'funding_by_country') return { xKey: 'country', yKey: 'total', labelKey: 'country' };
		if (metric === 'funding_by_sector') return { xKey: 'sector', yKey: 'total', labelKey: 'sector' };
		return { xKey: 'name', yKey: 'total', labelKey: 'name' };
	})();
	return (
		<LiveSectionShell title={section.title} refEl={ref}>
			{isLoading && <div className="card" style={{ padding: 12 }}>Loading…</div>}
			{!isLoading && data && data.length > 0 && (
				<div className="card" style={{ padding: 'var(--space-4)' }}>
					<ResponsiveContainer width="100%" height={300}>
						{chartType === 'line' ? (
							<LineChart data={data}>
								<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
								<XAxis dataKey={xKey} stroke="var(--fg-muted)" fontSize={11} />
								<YAxis stroke="var(--fg-muted)" fontSize={11} tickFormatter={(v) => `$${formatBig(v)}`} />
								<Tooltip contentStyle={{ background: 'var(--bg-1)', border: '1px solid var(--border)' }} formatter={(v) => `$${formatBig(Number(v))}`} />
								<Line type="monotone" dataKey={yKey} stroke="var(--accent)" strokeWidth={2} />
							</LineChart>
						) : chartType === 'pie' ? (
							<PieChart>
								<Pie data={data} dataKey={yKey} nameKey={labelKey} outerRadius={110}>
									{data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
								</Pie>
								<Tooltip formatter={(v) => `$${formatBig(Number(v))}`} />
							</PieChart>
						) : (
							<BarChart data={data}>
								<CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
								<XAxis dataKey={xKey} stroke="var(--fg-muted)" fontSize={11} />
								<YAxis stroke="var(--fg-muted)" fontSize={11} tickFormatter={(v) => `$${formatBig(v)}`} />
								<Tooltip contentStyle={{ background: 'var(--bg-1)', border: '1px solid var(--border)' }} formatter={(v) => `$${formatBig(Number(v))}`} />
								<Bar dataKey={yKey} fill="var(--accent)" />
							</BarChart>
						)}
					</ResponsiveContainer>
				</div>
			)}
		</LiveSectionShell>
	);
}

function EcosystemMapSection({ section }: { section: VisibleSection }) {
	const { ref, data, isLoading } = useLiveSectionData<Array<{
		id: string; name: string; entity_type: string; website: string | null;
		slug: string | null; city: string | null; country: string | null;
	}>>(section.id);
	return (
		<LiveSectionShell title={section.title} refEl={ref}>
			{isLoading && <div className="card" style={{ padding: 12 }}>Loading…</div>}
			{!isLoading && data && (
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
					{data.map((e) => (
						<div key={e.id} className="card" style={{ padding: 'var(--space-3)' }}>
							<div style={{ fontWeight: 600 }}>{e.name}</div>
							<div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
								{e.entity_type}{e.country ? ` · ${e.country}` : ''}
							</div>
						</div>
					))}
				</div>
			)}
		</LiveSectionShell>
	);
}

// ─── TipTap JSON renderer (read-only, ~30 lines) ────────────────────────────

interface TiptapNode {
	type: string;
	text?: string;
	attrs?: Record<string, unknown>;
	marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
	content?: TiptapNode[];
}

function RichText({ value, inline }: { value: unknown; inline?: boolean }) {
	if (value == null) return null;
	if (typeof value === 'string') return <>{value}</>;
	if (typeof value !== 'object') return null;
	return <TiptapRenderer doc={value} inline={inline} />;
}

function TiptapRenderer({ doc, inline }: { doc: unknown; inline?: boolean }) {
	if (!doc || typeof doc !== 'object') return null;
	if (inline) return <TiptapInline node={doc as TiptapNode} />;
	return <TiptapNodeRenderer node={doc as TiptapNode} />;
}

function TiptapInline({ node }: { node: TiptapNode }) {
	const out: ReactNode[] = [];
	const walk = (n: TiptapNode, key: string): void => {
		if (n.type === 'text') { out.push(<TiptapText key={key} text={n.text ?? ''} marks={n.marks} />); return; }
		if (n.type === 'hardBreak') { out.push(<br key={key} />); return; }
		if (Array.isArray(n.content)) n.content.forEach((child, i) => walk(child, `${key}-${i}`));
	};
	walk(node, '0');
	return <>{out}</>;
}

function TiptapNodeRenderer({ node }: { node: TiptapNode }) {
	const children = node.content?.map((c, i) => <TiptapNodeRenderer key={i} node={c} />);
	switch (node.type) {
		case 'doc':           return <>{children}</>;
		case 'paragraph':     return <p style={{ margin: '0 0 0.8em' }}>{children}</p>;
		case 'heading': {
			const Tag = (`h${(node.attrs?.level as number) ?? 2}`) as 'h2' | 'h3';
			return <Tag style={{ margin: '1.4em 0 0.5em', fontWeight: 700 }}>{children}</Tag>;
		}
		case 'bulletList':    return <ul style={{ paddingLeft: 24, margin: '0 0 0.8em' }}>{children}</ul>;
		case 'orderedList':   return <ol style={{ paddingLeft: 24, margin: '0 0 0.8em' }}>{children}</ol>;
		case 'listItem':      return <li>{children}</li>;
		case 'blockquote':    return <blockquote style={{ borderLeft: '3px solid var(--border)', paddingLeft: 12, margin: '0 0 0.8em', color: 'var(--fg-2)' }}>{children}</blockquote>;
		case 'codeBlock':     return <pre style={{ background: 'var(--bg-2)', padding: 12, overflowX: 'auto' }}><code>{children}</code></pre>;
		case 'horizontalRule': return <hr style={{ border: 0, borderTop: '1px solid var(--border)', margin: '1em 0' }} />;
		case 'hardBreak':     return <br />;
		case 'text':          return <TiptapText text={node.text ?? ''} marks={node.marks} />;
		default:              return <>{children}</>;
	}
}

function TiptapText({ text, marks }: { text: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> }) {
	let node: ReactNode = text;
	if (!marks) return <>{node}</>;
	for (const m of marks) {
		if (m.type === 'bold') node = <strong>{node}</strong>;
		else if (m.type === 'italic') node = <em>{node}</em>;
		else if (m.type === 'code') node = <code style={{ background: 'var(--bg-2)', padding: '0 4px' }}>{node}</code>;
		else if (m.type === 'link') {
			const href = (m.attrs?.href as string) ?? '#';
			node = <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{node} <ExternalLink size={10} style={{ verticalAlign: -1 }} /></a>;
		}
	}
	return <>{node}</>;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

function formatBig(n: number): string {
	if (!Number.isFinite(n)) return '—';
	if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
	if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
	if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
	return n.toFixed(0);
}
function formatDate(iso: string | null): string {
	if (!iso) return '—';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '—';
	return d.toISOString().slice(0, 10);
}
