'use client';

import { useEffect, useRef, useState } from 'react';
import { Collapse } from '../report-kit/collapse';

/**
 * sector_bubble — sector → sub-sector → sub-sub funding drilldown (the GSTER
 * "Data in Full" breakdown). Static content: a flat list of taxonomy `nodes`
 * that this widget folds into a 3-level hierarchy, exactly like the STX report.
 * Content: { value_label?, deal_label?, sector_colors?, sector_secondary_colors?,
 *   sector_labels?, framework_url?, nodes[]{ sector, sub_sector?, sub_sub_sector?, total_m, deals? } }.
 */
type Node = { sector: string; sub_sector?: string | null; sub_sub_sector?: string | null; total_m: number; deals?: number };
type SubSub = { label: string; value: number };
type Sub = { label: string; value: number; subSubs: SubSub[] };
type Sector = { label: string; value: number; subs: Sub[] };

const LEVEL = { 0: 'var(--rk-accent)', 1: '#6A9DA9', 2: '#BED0E3' } as const;

function fmtM(m: number): string {
	if (m >= 1000) return `$${(m / 1000).toFixed(1).replace('.0', '')}B`;
	return `$${Math.round(m)}M`;
}

function buildHierarchy(data: Node[]): Sector[] {
	const map = new Map<string, { value: number; subs: Map<string, { value: number; subSubs: Map<string, number> }> }>();
	for (const row of data) {
		if (!map.has(row.sector)) map.set(row.sector, { value: 0, subs: new Map() });
		const sec = map.get(row.sector)!;
		sec.value += row.total_m;
		const subKey = row.sub_sector || 'Other';
		if (!sec.subs.has(subKey)) sec.subs.set(subKey, { value: 0, subSubs: new Map() });
		const sub = sec.subs.get(subKey)!;
		sub.value += row.total_m;
		const ssKey = row.sub_sub_sector || 'Other';
		sub.subSubs.set(ssKey, (sub.subSubs.get(ssKey) ?? 0) + row.total_m);
	}
	const out: Sector[] = [];
	map.forEach((sec, label) => {
		const subs: Sub[] = [];
		sec.subs.forEach((sub, subLabel) => {
			const subSubs: SubSub[] = [];
			sub.subSubs.forEach((v, l) => subSubs.push({ label: l, value: v }));
			subs.push({ label: subLabel, value: sub.value, subSubs: subSubs.sort((a, b) => b.value - a.value) });
		});
		out.push({ label, value: sec.value, subs: subs.sort((a, b) => b.value - a.value) });
	});
	return out.sort((a, b) => b.value - a.value);
}

function AnimBar({ pct, color, height = 3, delay = 0 }: { pct: number; color: string; height?: number; delay?: number }) {
	const ref = useRef<HTMLDivElement>(null);
	const [go, setGo] = useState(false);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setGo(true); }, { threshold: 0.1 });
		obs.observe(el);
		return () => obs.disconnect();
	}, []);
	return (
		<div ref={ref} style={{ width: '100%', height, background: 'var(--rk-border)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
			<div style={{ height: '100%', width: go ? `${pct}%` : '0%', background: color, borderRadius: 2, transition: `width 0.85s cubic-bezier(0.16,1,0.3,1) ${delay}ms` }} />
		</div>
	);
}

export function SectorBubbleSection({ content }: { content: Record<string, unknown> }) {
	const nodes = (content.nodes as Node[]) ?? [];
	const fmtVal = fmtM;
	const sectorColors = (content.sector_colors as Record<string, string>) ?? {};
	const sectorSec = (content.sector_secondary_colors as Record<string, string>) ?? {};
	const sectorLabels = (content.sector_labels as Record<string, string>) ?? {};
	const frameworkUrl = content.framework_url as string | undefined;

	const hierarchy = buildHierarchy(nodes);
	const total = Math.max(hierarchy.reduce((s, x) => s + x.value, 0), 1);
	const [openSectors, setOpenSectors] = useState<Set<string>>(new Set());
	const [openSubs, setOpenSubs] = useState<Set<string>>(new Set());
	const toggle = (set: Set<string>, k: string) => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); return n; };

	return (
		<div style={{ width: '100%' }}>
			{hierarchy.map((sector, si) => {
				const isOpen = openSectors.has(sector.label);
				const secColor = sectorColors[sector.label] || LEVEL[0];
				return (
					<div key={sector.label} style={{ marginBottom: 2 }}>
						<div onClick={() => setOpenSectors((p) => toggle(p, sector.label))} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '10px 14px', background: isOpen ? `color-mix(in srgb, ${secColor} 7%, transparent)` : 'transparent', border: `1px solid ${isOpen ? `color-mix(in srgb, ${secColor} 44%, transparent)` : 'var(--rk-border)'}`, borderRadius: 4, transition: 'all 0.2s', userSelect: 'none' }}>
							<div style={{ flex: 1 }}>
								<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
										<span style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 9, letterSpacing: 2, color: isOpen ? secColor : 'var(--rk-fg-muted)', minWidth: 18, transition: 'transform 0.25s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
										<span style={{ fontSize: 14, fontWeight: 600, color: 'var(--rk-fg)' }}>{sectorLabels[sector.label] || sector.label}</span>
									</div>
									<div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
										<span style={{ fontSize: 11, color: 'var(--rk-fg-muted)' }}>{((sector.value / total) * 100).toFixed(1)}%</span>
										<span style={{ fontSize: 13, color: secColor, fontWeight: 700 }}>{fmtVal(sector.value)}</span>
									</div>
								</div>
								<AnimBar pct={(sector.value / total) * 100} color={secColor} height={3} delay={si * 60} />
							</div>
						</div>
						<Collapse open={isOpen}>
							<div style={{ paddingLeft: 20, paddingTop: 4 }}>
								{sector.subs.map((sub, subi) => {
									const subKey = `${sector.label}::${sub.label}`;
									const isSubOpen = openSubs.has(subKey);
									const subColor = sectorSec[sector.label] || LEVEL[1];
									const hasSS = sub.subSubs.length > 0 && !(sub.subSubs.length === 1 && sub.subSubs[0].label === 'Other');
									return (
										<div key={sub.label} style={{ marginBottom: 2 }}>
											<div onClick={(e) => { e.stopPropagation(); if (hasSS) setOpenSubs((p) => toggle(p, subKey)); }} style={{ display: 'flex', alignItems: 'center', cursor: hasSS ? 'pointer' : 'default', padding: '8px 12px', background: isSubOpen ? `color-mix(in srgb, ${subColor} 7%, transparent)` : 'transparent', border: `1px solid ${isSubOpen ? `color-mix(in srgb, ${subColor} 44%, transparent)` : 'var(--rk-border)'}`, borderRadius: 3, transition: 'all 0.2s', userSelect: 'none' }}>
												<div style={{ flex: 1 }}>
													<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
														<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
															{hasSS && <span style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 8, letterSpacing: 1, color: isSubOpen ? subColor : 'var(--rk-fg-muted)', minWidth: 14, transition: 'transform 0.25s', display: 'inline-block', transform: isSubOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>}
															<span style={{ fontSize: 12, color: 'var(--rk-fg)' }}>{sub.label}</span>
														</div>
														<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
															<span style={{ fontSize: 10, color: 'var(--rk-fg-muted)' }}>{((sub.value / total) * 100).toFixed(1)}%</span>
															<span style={{ fontSize: 12, color: subColor, fontWeight: 700 }}>{fmtVal(sub.value)}</span>
														</div>
													</div>
													<AnimBar pct={(sub.value / total) * 100} color={subColor} height={2} delay={subi * 45} />
												</div>
											</div>
											{hasSS && (
												<Collapse open={isSubOpen}>
													<div style={{ paddingLeft: 20, paddingTop: 3, paddingBottom: 6 }}>
														{sub.subSubs.map((ss, ssi) => (
															<div key={ss.label} style={{ display: 'flex', alignItems: 'center', padding: '7px 12px', marginBottom: 2, border: '1px solid var(--rk-border)', borderRadius: 3 }}>
																<div style={{ flex: 1 }}>
																	<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
																		<span style={{ fontSize: 11, color: 'var(--rk-fg-muted)' }}>{ss.label}</span>
																		<div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
																			<span style={{ fontSize: 10, color: 'var(--rk-fg-muted)' }}>{((ss.value / total) * 100).toFixed(1)}%</span>
																			<span style={{ fontSize: 11, color: subColor, fontWeight: 700 }}>{fmtVal(ss.value)}</span>
																		</div>
																	</div>
																	<AnimBar pct={(ss.value / total) * 100} color={`color-mix(in srgb, ${subColor} 53%, transparent)`} height={2} delay={ssi * 30} />
																</div>
															</div>
														))}
													</div>
												</Collapse>
											)}
										</div>
									);
								})}
							</div>
						</Collapse>
					</div>
				);
			})}
			{frameworkUrl && (
				<div style={{ marginTop: 14, fontSize: 10 }}>
					<a href={frameworkUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--rk-accent)', textDecoration: 'none' }}>Understand the Framework →</a>
				</div>
			)}
		</div>
	);
}
