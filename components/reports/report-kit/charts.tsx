'use client';

import { useEffect, useRef, useState } from 'react';
import { BRAND } from './report-theme';
import { formatBig } from './format';
import { useReveal } from './use-reveal';

/**
 * Bespoke report charts — CSS bars + inline SVG, NO chart library, matching the
 * STX Intelligence-Hub reports exactly. All take a normalized point list; the
 * data_chart section maps each metric's rows into it. Colours come from the
 * report accent (--rk-accent) with the brand navy/teal/green for series.
 */
export interface Point { label: string; value: number; deals?: number; highlight?: boolean }

const money = (m: number) => `$${formatBig(m)}`;
const LINE = BRAND.greenLight;

/** Vertical bars + an optional SVG deal-count line overlay (the GSTER year chart). */
export function YearBarsLineChart({ data, valueLabel = 'Funding', lineLabel = 'Rounds' }: { data: Point[]; valueLabel?: string; lineLabel?: string }) {
	const { ref, shown } = useReveal<HTMLDivElement>();
	const [w, setW] = useState(0);
	useEffect(() => {
		const el = ref.current; if (!el) return;
		const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
		ro.observe(el); return () => ro.disconnect();
	}, [ref]);
	const maxVal = Math.max(...data.map((d) => d.value), 1);
	const hasLine = data.some((d) => typeof d.deals === 'number');
	const maxDeals = Math.max(...data.map((d) => d.deals ?? 0), 1);
	const H = 280, padB = 44, gap = 10;
	const n = data.length;
	const barW = n > 0 ? (w - (n - 1) * gap) / n : 0;
	const pts = data.map((d, i) => {
		const x = i * (barW + gap) + barW / 2;
		const usableH = H - padB - 30;
		const y = (1 - (d.deals ?? 0) / maxDeals) * usableH + 15;
		return { x, y, deals: d.deals ?? 0 };
	});
	const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
	return (
		<div ref={ref} style={{ position: 'relative' }}>
			<div style={{ display: 'flex', alignItems: 'flex-end', gap, height: H, paddingBottom: padB, borderBottom: '1px solid var(--rk-border)', position: 'relative' }}>
				{data.map((d, i) => {
					const pct = (d.value / maxVal) * 100;
					return (
						<div key={d.label} title={`${d.label}: ${money(d.value)}${typeof d.deals === 'number' ? ` · ${d.deals} ${lineLabel.toLowerCase()}` : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
							<div style={{ width: '100%', minHeight: 4, borderRadius: '3px 3px 0 0', position: 'relative', height: shown ? `${pct}%` : '0%', transition: `height 1.3s cubic-bezier(0.16,1,0.3,1) ${i * 0.07}s`, background: d.highlight ? `linear-gradient(to top, ${BRAND.tealBright}, ${BRAND.lightBlue}66)` : `linear-gradient(to top, var(--rk-accent), ${BRAND.teal}55)` }}>
								<span style={{ position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--rk-fg-sec)' }}>{money(d.value)}</span>
							</div>
							<div style={{ fontSize: 10, color: 'var(--rk-fg-muted)', textAlign: 'center', fontWeight: d.highlight ? 700 : 400 }}>{d.label}</div>
						</div>
					);
				})}
				{hasLine && w > 0 && (
					<svg style={{ position: 'absolute', top: 0, left: 0, width: w, height: H - padB, pointerEvents: 'none', overflow: 'visible' }}>
						<path d={path} fill="none" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: shown ? 1 : 0, transition: 'opacity 0.8s ease 0.6s' }} />
						{pts.map((p, i) => (
							<g key={i} style={{ opacity: shown ? 1 : 0, transition: `opacity 0.5s ease ${0.8 + i * 0.05}s` }}>
								<circle cx={p.x} cy={p.y} r="3.5" fill={LINE} />
								<text x={p.x} y={p.y - 10} textAnchor="middle" fill={LINE} fontSize="9" fontWeight="600">{p.deals}</text>
							</g>
						))}
					</svg>
				)}
			</div>
			<div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 12, fontSize: 11, color: 'var(--rk-fg-muted)' }}>
				<span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 2, background: `linear-gradient(to top, var(--rk-accent), ${BRAND.teal}55)` }} />{valueLabel}</span>
				{hasLine && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 2.5, background: LINE, borderRadius: 2 }} />{lineLabel}</span>}
			</div>
		</div>
	);
}

/** Generic vertical bars (no line). */
export function BarsChart({ data }: { data: Point[] }) {
	const { ref, shown } = useReveal<HTMLDivElement>();
	const max = Math.max(...data.map((d) => d.value), 1);
	return (
		<div ref={ref} style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 260, borderBottom: '1px solid var(--rk-border)', paddingBottom: 28 }}>
			{data.map((d, i) => (
				<div key={d.label} title={`${d.label}: ${money(d.value)}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
					<div style={{ width: '100%', minHeight: 4, borderRadius: '3px 3px 0 0', height: shown ? `${(d.value / max) * 100}%` : '0%', transition: `height 1.1s cubic-bezier(0.16,1,0.3,1) ${i * 0.05}s`, background: `linear-gradient(to top, var(--rk-accent), ${BRAND.teal}55)`, position: 'relative' }}>
						<span style={{ position: 'absolute', top: -20, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', color: 'var(--rk-fg-sec)' }}>{money(d.value)}</span>
					</div>
					<div style={{ fontSize: 10, color: 'var(--rk-fg-muted)', textAlign: 'center' }}>{d.label}</div>
				</div>
			))}
		</div>
	);
}

/** SVG line chart. */
export function LineChartRk({ data }: { data: Point[] }) {
	const { ref, shown } = useReveal<HTMLDivElement>();
	const W = 640, H = 240, padX = 10, padY = 20;
	const max = Math.max(...data.map((d) => d.value), 1);
	const n = data.length;
	const pts = data.map((d, i) => ({ x: padX + (i / Math.max(n - 1, 1)) * (W - padX * 2), y: padY + (1 - d.value / max) * (H - padY * 2), d }));
	const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
	return (
		<div ref={ref}>
			<svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', overflow: 'visible' }}>
				<path d={path} fill="none" stroke="var(--rk-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray: 2000, strokeDashoffset: shown ? 0 : 2000, transition: 'stroke-dashoffset 1.4s ease' }} />
				{pts.map((p, i) => (
					<g key={i}>
						<circle cx={p.x} cy={p.y} r="3.5" fill="var(--rk-accent)" style={{ opacity: shown ? 1 : 0, transition: `opacity .4s ease ${0.4 + i * 0.05}s` }} />
						<text x={p.x} y={H - 4} textAnchor="middle" fontSize="10" fill="var(--rk-fg-muted)">{p.d.label}</text>
					</g>
				))}
			</svg>
		</div>
	);
}

/** SVG donut + legend. */
export function DonutChart({ data }: { data: Point[] }) {
	const COLORS = [BRAND.navy, BRAND.teal, BRAND.tealBright, BRAND.pink, BRAND.slate, BRAND.lightBlue, BRAND.darkTitle];
	const total = data.reduce((s, d) => s + d.value, 0) || 1;
	let acc = 0;
	const R = 80, C = 2 * Math.PI * R;
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
			<svg width="200" height="200" viewBox="0 0 200 200">
				<g transform="rotate(-90 100 100)">
					{data.map((d, i) => {
						const frac = d.value / total;
						const dash = frac * C;
						const el = <circle key={i} cx="100" cy="100" r={R} fill="none" stroke={COLORS[i % COLORS.length]} strokeWidth="34" strokeDasharray={`${dash} ${C - dash}`} strokeDashoffset={-acc} />;
						acc += dash; return el;
					})}
				</g>
			</svg>
			<div style={{ display: 'grid', gap: 8 }}>
				{data.map((d, i) => (
					<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--rk-fg-sec)' }}>
						<span style={{ width: 12, height: 12, borderRadius: 3, background: COLORS[i % COLORS.length] }} />
						<span style={{ fontWeight: 600 }}>{d.label}</span>
						<span style={{ fontFamily: 'var(--rk-font-mono)', color: 'var(--rk-accent)' }}>{money(d.value)} · {Math.round((d.value / total) * 100)}%</span>
					</div>
				))}
			</div>
		</div>
	);
}

/** Horizontal bar list. */
export function BarList({ data }: { data: Point[] }) {
	const max = Math.max(...data.map((d) => d.value), 1);
	return (
		<div style={{ display: 'grid', gap: 12 }}>
			{data.slice(0, 12).map((d, i) => (
				<div key={i}>
					<div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
						<span style={{ fontWeight: 600, color: 'var(--rk-fg)' }}>{d.label}</span>
						<span style={{ fontFamily: 'var(--rk-font-mono)', color: 'var(--rk-accent)', fontWeight: 500 }}>{money(d.value)}</span>
					</div>
					<div style={{ height: 8, background: 'var(--rk-bg-sec)', borderRadius: 4, overflow: 'hidden' }}>
						<div style={{ width: `${(d.value / max) * 100}%`, height: '100%', background: `linear-gradient(to right, var(--rk-accent), color-mix(in srgb, var(--rk-accent) 73%, transparent))`, transition: 'width .8s cubic-bezier(.16,1,.3,1)' }} />
					</div>
				</div>
			))}
		</div>
	);
}

/** Big-number region/metric cards with % share. */
export function RegionCards({ data }: { data: Point[] }) {
	const total = data.reduce((s, d) => s + d.value, 0) || 1;
	return (
		<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
			{data.map((d, i) => (
				<div key={i} style={{ padding: '24px 26px', borderRadius: 12, background: 'var(--rk-bg-card)', border: '1px solid var(--rk-border)' }}>
					<div style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--rk-fg-muted)' }}>{d.label}</div>
					<div style={{ fontFamily: 'var(--rk-font-display)', fontSize: 40, color: 'var(--rk-accent)', marginTop: 6, lineHeight: 1 }}>{money(d.value)}</div>
					<div style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 11, color: 'var(--rk-fg-muted)', marginTop: 6 }}>{Math.round((d.value / total) * 100)}% global{typeof d.deals === 'number' ? ` · ${d.deals.toLocaleString()} deals` : ''}</div>
				</div>
			))}
		</div>
	);
}
