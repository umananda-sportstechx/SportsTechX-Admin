'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { VisibleSection } from '../report-kit/types';
import { useLiveSectionData } from '../report-kit/live-data';
import { RichText } from '../report-kit/tiptap';

/**
 * ecosystem_map — the GSTER global ecosystem map: a d3 Natural-Earth world
 * with clickable continent pie-bubbles that open a tabbed, category-grouped
 * entity panel. Entities come live from the section-data feed; labels, tab
 * colours and the CTA band come from `content`. Reproduces the STX widget.
 */
type EcoEntity = {
	id: string; name: string; entity_type: string; website: string | null;
	slug: string | null; gster26: boolean | null; category: string | null;
	founded_year: number | null; city: string | null; country: string | null; region: string | null;
};
type TabDef = { type: string; label: string; color: string };

const W = 900;
const H = 460;
const DEFAULT_COLORS = ['#E08B35', '#6A9DA9', '#2B3D8F', '#ED1A5E', '#76ADA7'];

const CONTINENTS = [
	{ id: 'North America', label: 'N. America', center: [-95, 48] as [number, number] },
	{ id: 'South America', label: 'S. America', center: [-58, -15] as [number, number] },
	{ id: 'Europe', label: 'Europe', center: [15, 52] as [number, number] },
	{ id: 'Africa', label: 'Africa', center: [22, 3] as [number, number] },
	{ id: 'Asia', label: 'Asia', center: [90, 40] as [number, number] },
	{ id: 'Oceania', label: 'Oceania', center: [135, -25] as [number, number] },
];

function normalizeContinent(raw: string | null): string | null {
	if (!raw) return null;
	const l = raw.toLowerCase().trim();
	if (l.includes('north america')) return 'North America';
	if (l.includes('south america') || l.includes('latin')) return 'South America';
	if (l.includes('europe')) return 'Europe';
	if (l.includes('africa')) return 'Africa';
	if (l.includes('asia') || l.includes('apac') || l.includes('middle east')) return 'Asia';
	if (l.includes('oceania') || l.includes('australia') || l.includes('pacific')) return 'Oceania';
	return null;
}

const FLAG_MAP: Record<string, string> = {
	USA: 'US', 'United States': 'US', UK: 'GB', 'United Kingdom': 'GB', Germany: 'DE', France: 'FR',
	Australia: 'AU', India: 'IN', China: 'CN', Canada: 'CA', Finland: 'FI', Spain: 'ES', Ireland: 'IE',
	Brazil: 'BR', Netherlands: 'NL', Italy: 'IT', Japan: 'JP', 'South Korea': 'KR', Singapore: 'SG',
	Israel: 'IL', Sweden: 'SE', Norway: 'NO', Denmark: 'DK', Switzerland: 'CH', Belgium: 'BE',
	Austria: 'AT', Portugal: 'PT', Poland: 'PL', 'Czech Republic': 'CZ', Romania: 'RO', 'South Africa': 'ZA',
	Mexico: 'MX', Argentina: 'AR', Chile: 'CL', Colombia: 'CO', 'New Zealand': 'NZ', Thailand: 'TH',
	Indonesia: 'ID', Malaysia: 'MY', Philippines: 'PH', Vietnam: 'VN', Turkey: 'TR', UAE: 'AE',
	'United Arab Emirates': 'AE', 'Saudi Arabia': 'SA', Egypt: 'EG', Nigeria: 'NG', Kenya: 'KE',
	Ghana: 'GH', Greece: 'GR', Qatar: 'QA', Bahrain: 'BH', Kuwait: 'KW',
};
function countryToFlag(country: string): string {
	const code = FLAG_MAP[country];
	if (!code) return '🌍';
	return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function EcosystemMapSection({ section }: { section: VisibleSection }) {
	const content = section.content;
	const intro = content.intro;
	const gster26Only = content.gster26_only !== false; // default true (public "limited" view)
	const cta = content.cta as { logo_url?: string; title?: string; subtitle?: string; href?: string; label?: string } | undefined;

	const { ref, data, isLoading } = useLiveSectionData<EcoEntity[]>(section.id);
	const entities = useMemo(() => data ?? [], [data]);

	// Tabs: from content, else derived from the entity_types present.
	const tabs: TabDef[] = useMemo(() => {
		const defined = content.tabs as Array<{ type: string; label: string; color?: string }> | undefined;
		if (defined?.length) return defined.map((t, i) => ({ type: t.type, label: t.label, color: t.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length] }));
		const seen: string[] = [];
		for (const e of entities) if (e.entity_type && !seen.includes(e.entity_type)) seen.push(e.entity_type);
		return seen.map((type, i) => ({ type, label: type.charAt(0).toUpperCase() + type.slice(1) + 's', color: DEFAULT_COLORS[i % DEFAULT_COLORS.length] }));
	}, [content.tabs, entities]);
	const tabColor = (type: string) => tabs.find((t) => t.type === type)?.color ?? DEFAULT_COLORS[0];
	const tabLabel = (type: string) => tabs.find((t) => t.type === type)?.label ?? type;

	// Map geometry
	const [countryPaths, setCountryPaths] = useState<{ id: string; d: string }[]>([]);
	const [mapReady, setMapReady] = useState(false);
	const projRef = useRef<((c: [number, number]) => [number, number] | null) | null>(null);

	const [selected, setSelected] = useState<string | null>(null);
	const [hovered, setHovered] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<string>(tabs[0]?.type ?? '');
	const panelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		let alive = true;
		fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json')
			.then((r) => r.json())
			.then((world: unknown) => {
				if (!alive) return;
				const w = world as { objects: { countries: unknown } };
				const fc = feature(w as never, w.objects.countries as never) as unknown as { features: unknown[] };
				const proj = geoNaturalEarth1().scale(W / 6.28).translate([W / 2, H / 2]);
				const pathFn = geoPath().projection(proj);
				setCountryPaths(fc.features.map((f) => ({ id: String((f as { id?: unknown }).id), d: pathFn(f as never) || '' })));
				projRef.current = (coords) => { const r = proj(coords); return r ? [r[0], r[1]] : null; };
				setMapReady(true);
			})
			.catch(() => setMapReady(true));
		return () => { alive = false; };
	}, []);

	const continentCenters = useMemo(() => {
		if (!mapReady || !projRef.current) return {} as Record<string, { x: number; y: number }>;
		const proj = projRef.current;
		const out: Record<string, { x: number; y: number }> = {};
		for (const c of CONTINENTS) { const pt = proj(c.center); if (pt) out[c.id] = { x: pt[0], y: pt[1] }; }
		return out;
	}, [mapReady]);

	// Counts per continent per tab-type
	const contCounts = useMemo(() => {
		const out: Record<string, Record<string, number>> = {};
		for (const e of entities) {
			const c = normalizeContinent(e.region);
			if (!c) continue;
			(out[c] ??= {})[e.entity_type] = ((out[c] ??= {})[e.entity_type] ?? 0) + 1;
		}
		return out;
	}, [entities]);
	const totalFor = (c: Record<string, number> | undefined) => c ? tabs.reduce((s, t) => s + (c[t.type] ?? 0), 0) : 0;
	const maxTotal = useMemo(() => { let m = 1; for (const c of Object.values(contCounts)) m = Math.max(m, totalFor(c)); return m; }, [contCounts, tabs]);

	// Pick first non-empty tab when continent changes
	useEffect(() => {
		if (!selected) return;
		const first = tabs.find((t) => entities.some((e) => normalizeContinent(e.region) === selected && e.entity_type === t.type));
		setActiveTab(first?.type ?? tabs[0]?.type ?? '');
	}, [selected, tabs, entities]);

	useEffect(() => {
		if (selected && panelRef.current) {
			const id = setTimeout(() => panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 400);
			return () => clearTimeout(id);
		}
	}, [selected]);

	const filtered = useMemo(() => entities
		.filter((e) => normalizeContinent(e.region) === selected && e.entity_type === activeTab)
		.filter((e) => !gster26Only || e.gster26 === true), [entities, selected, activeTab, gster26Only]);

	const grouped = useMemo(() => {
		const g: Record<string, EcoEntity[]> = {};
		for (const e of filtered) (g[e.category || 'Other'] ??= []).push(e);
		const cmp = (a: string | null, b: string | null) => (a || '').localeCompare(b || '');
		for (const arr of Object.values(g)) arr.sort((a, b) => cmp(a.country, b.country) || cmp(a.city, b.city));
		return Object.entries(g).sort((a, b) => b[1].length - a[1].length);
	}, [filtered]);

	const renderPie = useCallback((cx: number, cy: number, r: number, counts: Record<string, number>) => {
		const segs = tabs.map((t) => ({ type: t.type, color: t.color, v: counts[t.type] ?? 0 })).filter((s) => s.v > 0);
		const total = segs.reduce((s, x) => s + x.v, 0);
		if (total === 0) return null;
		if (segs.length === 1) return <circle cx={cx} cy={cy} r={r} fill={segs[0].color} opacity={0.9} />;
		let start = -Math.PI / 2;
		return segs.map((seg) => {
			const angle = (seg.v / total) * 2 * Math.PI;
			const end = start + angle;
			const x1 = cx + r * Math.cos(start), y1 = cy + r * Math.sin(start);
			const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
			const d = `M ${cx},${cy} L ${x1},${y1} A ${r},${r} 0 ${angle > Math.PI ? 1 : 0},1 ${x2},${y2} Z`;
			start = end;
			return <path key={seg.type} d={d} fill={seg.color} opacity={0.9} />;
		});
	}, [tabs]);

	const logoToken = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;

	return (
		<div ref={ref}>
			{/* Intro + legend */}
			<div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'space-between', marginBottom: 24 }}>
				{intro != null && <p style={{ flex: '1 1 320px', fontSize: 14, color: 'var(--rk-fg-sec)', lineHeight: 1.8, margin: 0 }}><RichText value={intro} inline /></p>}
				<div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
					{tabs.map((t) => {
						const total = entities.filter((e) => e.entity_type === t.type).length;
						return (
							<div key={t.type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
								<div style={{ width: 10, height: 10, borderRadius: '50%', background: t.color }} />
								<span style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--rk-fg-muted)', textTransform: 'uppercase' }}>{t.label}</span>
								{total > 0 && <span style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 10, color: t.color, background: `color-mix(in srgb, ${t.color} 14%, transparent)`, padding: '1px 7px', borderRadius: 8 }}>{total}</span>}
							</div>
						);
					})}
				</div>
			</div>

			{/* Map */}
			<div style={{ position: 'relative', background: 'var(--rk-bg-card)', border: '1px solid var(--rk-border)', borderRadius: 8, overflow: 'hidden' }}>
				{(!mapReady || isLoading) && (
					<div style={{ height: H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
						<span style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 11, color: 'var(--rk-fg-muted)', letterSpacing: 3 }}>LOADING MAP…</span>
					</div>
				)}
				{mapReady && !isLoading && (
					<svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
						<defs>
							<radialGradient id={`ocean-${section.id}`} cx="50%" cy="50%" r="70%">
								<stop offset="0%" stopColor="var(--rk-map-ocean-0)" />
								<stop offset="100%" stopColor="var(--rk-map-ocean-1)" />
							</radialGradient>
						</defs>
						<rect width={W} height={H} fill={`url(#ocean-${section.id})`} />
						{countryPaths.map((cp) => (
							<path key={cp.id} d={cp.d} fill="var(--rk-map-land)" stroke="var(--rk-map-stroke)" strokeWidth={0.4} />
						))}
						{CONTINENTS.map((cont) => {
							const center = continentCenters[cont.id];
							if (!center) return null;
							const counts = contCounts[cont.id] || {};
							const total = totalFor(counts);
							const isSel = selected === cont.id;
							const isHov = hovered === cont.id;
							const r = total > 0 ? Math.max(16, 16 + (total / maxTotal) * 20) : 14;
							return (
								<g key={cont.id} style={{ cursor: 'pointer' }}
									onClick={() => setSelected(isSel ? null : cont.id)}
									onMouseEnter={() => setHovered(cont.id)} onMouseLeave={() => setHovered(null)}>
									{total > 0 && (
										<circle cx={center.x} cy={center.y} r={r + 6} fill="none"
											stroke={isSel ? 'var(--rk-accent)' : isHov ? '#6A9DA9' : 'rgba(255,255,255,0.15)'}
											strokeWidth={isSel || isHov ? 1.5 : 1} style={{ transition: 'all 0.3s' }}>
											{!isSel && (<>
												<animate attributeName="r" values={`${r + 4};${r + 10};${r + 4}`} dur="3s" repeatCount="indefinite" />
												<animate attributeName="opacity" values="0.4;0;0.4" dur="3s" repeatCount="indefinite" />
											</>)}
										</circle>
									)}
									<circle cx={center.x} cy={center.y} r={r + 2}
										fill={isSel ? 'color-mix(in srgb, var(--rk-accent) 13%, transparent)' : isHov ? 'rgba(106,157,169,0.08)' : 'rgba(0,0,0,0.18)'}
										stroke={isSel ? 'var(--rk-accent)' : isHov ? '#6A9DA9' : 'rgba(255,255,255,0.3)'}
										strokeWidth={isSel ? 2 : 1} style={{ transition: 'all 0.25s' }} />
									{total > 0 ? renderPie(center.x, center.y, r, counts) : <circle cx={center.x} cy={center.y} r={r} fill="rgba(255,255,255,0.06)" />}
									{total > 0 && (
										<text x={center.x} y={center.y + 4} textAnchor="middle" style={{ fontFamily: 'var(--rk-font-display)', fontSize: Math.max(10, r * 0.7), fill: '#fff', pointerEvents: 'none' }}>{total}</text>
									)}
									<text x={center.x} y={center.y + r + 14} textAnchor="middle" style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 8, letterSpacing: 1.5, fill: isSel ? 'var(--rk-accent)' : isHov ? '#6A9DA9' : 'var(--rk-fg-muted)', textTransform: 'uppercase', transition: 'fill 0.25s', pointerEvents: 'none' }}>{cont.label}</text>
								</g>
							);
						})}
					</svg>
				)}
				{/* Hover tooltip */}
				<div style={{ position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)', background: 'var(--rk-bg-card)', border: '1px solid color-mix(in srgb, var(--rk-accent) 44%, transparent)', borderRadius: 6, padding: '10px 20px', display: 'flex', gap: 18, alignItems: 'center', zIndex: 10, whiteSpace: 'nowrap', opacity: hovered && !selected && contCounts[hovered] ? 1 : 0, pointerEvents: 'none', transition: 'opacity 0.2s ease' }}>
					<span style={{ fontFamily: 'var(--rk-font-display)', fontSize: 17, color: 'var(--rk-title)' }}>{hovered || ''}</span>
					{tabs.map((t) => (
						<div key={t.type} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
							<div style={{ width: 7, height: 7, borderRadius: '50%', background: t.color }} />
							<span style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 10, color: 'var(--rk-fg-muted)' }}>{hovered ? (contCounts[hovered]?.[t.type] ?? 0) : 0}</span>
						</div>
					))}
				</div>
			</div>

			{/* CTA band */}
			{cta && (
				<div style={{ marginTop: 28, padding: 'clamp(28px,4vw,40px) clamp(20px,4vw,48px)', background: 'var(--rk-cta-bg)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 28, borderRadius: 12, position: 'relative', overflow: 'hidden' }}>
					<div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, transparent, var(--rk-accent), transparent)' }} />
					{cta.logo_url && (/* eslint-disable-next-line @next/next/no-img-element */ <img src={cta.logo_url} alt="" style={{ width: 150, opacity: 0.9, position: 'relative', zIndex: 1, flexShrink: 0, objectFit: 'contain' }} />)}
					<div style={{ position: 'relative', zIndex: 1 }}>
						{cta.title && <div style={{ fontFamily: 'var(--rk-font-display)', fontSize: 'clamp(20px,3vw,26px)', color: '#fff', lineHeight: 1.2, marginBottom: 4 }}>{cta.title}</div>}
						{cta.subtitle && <div style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.6)', letterSpacing: '0.04em' }}>{cta.subtitle}</div>}
					</div>
					{cta.href && cta.label && (
						<a href={cta.href} target="_blank" rel="noopener noreferrer" style={{ position: 'relative', zIndex: 1, fontFamily: 'var(--rk-font-display)', fontSize: 14, letterSpacing: '0.12em', color: '#fff', background: 'var(--rk-accent)', textDecoration: 'none', padding: '11px 32px', borderRadius: 50, whiteSpace: 'nowrap' }}>{cta.label}</a>
					)}
				</div>
			)}

			{/* Detail panel */}
			{selected && (
				<div ref={panelRef} style={{ marginTop: 24, background: 'var(--rk-bg-card)', border: '1px solid var(--rk-border)', borderRadius: 8, overflow: 'hidden' }}>
					<div style={{ padding: '28px 32px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, background: 'color-mix(in srgb, var(--rk-accent) 6%, transparent)', borderBottom: '1px solid var(--rk-border)' }}>
						<div style={{ paddingBottom: 24 }}>
							<p style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 9, letterSpacing: '0.2em', color: 'var(--rk-accent)', textTransform: 'uppercase', marginBottom: 8 }}>Exploring</p>
							<h3 style={{ fontFamily: 'var(--rk-font-display)', fontSize: 'clamp(28px,4vw,52px)', lineHeight: 0.95, color: 'var(--rk-title)', margin: 0 }}>{selected.toUpperCase()}</h3>
							<div style={{ display: 'flex', gap: 16, marginTop: 14, flexWrap: 'wrap' }}>
								{tabs.map((t) => {
									const count = entities.filter((e) => normalizeContinent(e.region) === selected && e.entity_type === t.type).length;
									return (
										<div key={t.type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
											<div style={{ width: 8, height: 8, borderRadius: '50%', background: t.color }} />
											<span style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 10, color: 'var(--rk-fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{count} {t.label}</span>
										</div>
									);
								})}
							</div>
						</div>
						<button onClick={() => setSelected(null)} style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 10, letterSpacing: '0.16em', padding: '8px 18px', border: '1px solid var(--rk-border)', borderRadius: 4, background: 'transparent', color: 'var(--rk-fg-muted)', cursor: 'pointer', textTransform: 'uppercase', marginTop: 4 }}>✕ Close</button>
					</div>
					<div style={{ display: 'flex', padding: '0 32px', borderBottom: '2px solid var(--rk-border)', overflowX: 'auto' }}>
						{tabs.filter((t) => entities.some((e) => normalizeContinent(e.region) === selected && e.entity_type === t.type)).map((t) => {
							const active = activeTab === t.type;
							return (
								<button key={t.type} onClick={() => setActiveTab(t.type)} style={{ fontFamily: 'var(--rk-font-display)', fontSize: 20, letterSpacing: '0.1em', padding: '14px 28px 17px', background: 'none', border: 'none', borderBottom: active ? `3px solid ${t.color}` : '3px solid transparent', color: active ? t.color : 'var(--rk-fg-muted)', cursor: 'pointer', marginBottom: -2 }}>{t.label}</button>
							);
						})}
					</div>
					<div style={{ padding: '20px 28px 28px' }}>
						{filtered.length === 0 ? (
							<div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--rk-fg-muted)', fontFamily: 'var(--rk-font-mono)', fontSize: 11, letterSpacing: 2 }}>NO {tabLabel(activeTab).toUpperCase()} FOUND</div>
						) : (
							<div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
								{grouped.map(([category, items]) => {
									const accent = tabColor(activeTab);
									return (
										<div key={category}>
											<div style={{ fontFamily: 'var(--rk-font-display)', fontSize: 18, color: accent, letterSpacing: '0.04em', marginBottom: 10, borderBottom: `1.5px solid color-mix(in srgb, ${accent} 30%, transparent)`, paddingBottom: 6 }}>{category}</div>
											<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 8 }}>
												{items.map((e, i) => {
													const href = e.website ? (e.website.startsWith('http') ? e.website : `https://${e.website}`) : undefined;
													const domain = e.website ? e.website.replace(/^https?:\/\//, '').replace(/\/.*$/, '') : null;
													const logoUrl = domain && logoToken ? `https://img.logo.dev/${domain}?token=${encodeURIComponent(logoToken)}&size=64&format=png` : null;
													const isNew = e.founded_year === 2025 || e.founded_year === 2026;
													const CardTag = (href ? 'a' : 'div') as 'a';
													return (
														<CardTag key={`${e.id}-${i}`} {...(href ? { href, target: '_blank', rel: 'noopener noreferrer' } : {})} className="rk-hoverlift"
															style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: isNew ? 'color-mix(in srgb, var(--rk-accent) 6%, transparent)' : 'var(--rk-bg)', borderRadius: 6, border: '1px solid var(--rk-border)', borderLeft: isNew ? '3px solid var(--rk-accent)' : '1px solid var(--rk-border)', textDecoration: 'none', color: 'inherit', cursor: href ? 'pointer' : 'default' }}>
															<div style={{ width: 30, height: 30, borderRadius: 4, flexShrink: 0, background: 'var(--rk-bg-card)', border: '1px solid var(--rk-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
																{logoUrl
																	/* eslint-disable-next-line @next/next/no-img-element */
																	? <img src={logoUrl} alt="" width={22} height={22} style={{ objectFit: 'contain' }} onError={(ev) => { (ev.target as HTMLImageElement).style.display = 'none'; }} />
																	: <span style={{ fontFamily: 'var(--rk-font-display)', fontSize: 14, color: accent }}>{(e.name || '?').charAt(0)}</span>}
															</div>
															<div style={{ flex: 1, minWidth: 0 }}>
																<div style={{ fontFamily: 'var(--rk-font-display)', fontSize: 14, color: 'var(--rk-title)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
																<div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
																	<span style={{ fontSize: 10, lineHeight: 1 }}>{countryToFlag(e.country || '')}</span>
																	<span style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 9, color: 'var(--rk-fg-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.city || e.country || ''}</span>
																</div>
															</div>
														</CardTag>
													);
												})}
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
