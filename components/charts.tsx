'use client';

/**
 * Analytics chart primitives — ported verbatim from the client app's
 * `client/components/ui/analytics-charts.tsx` so the admin surface shares the
 * exact same visual language. All charts are self-rendering SVG (no chart
 * library) and resolve colours from CSS variables, so light/dark switch is
 * automatic. The supporting classes (`.pie-tip`, `.cbl-wrap`, `.hb-*`,
 * `.an-legend`) live in `admin/app/globals.css` (chart-primitives block).
 *
 * - `PieDonut`     : pie / donut / horizontal bar with hover tooltips.
 * - `PieLegend`    : key/value list shown next to a pie/donut.
 * - `ComboBarLine` : bar chart (amounts) + line overlay (counts).
 * - `HBarDrilldown`: hierarchical horizontal progress rows (up to 3 levels).
 * - `SegToggle` / `YearRangeToggle`: chip-style segment toggles.
 */

import { useRef, useState } from 'react';

export interface PieSegment {
	name: string;
	v: number;
	color: string;
	label?: string;
}

export interface ComboPoint {
	year?: string | number;
	label?: string;
	amt: number;
	deals: number;
}

// ─── SegToggle ────────────────────────────────────────────────────────────

interface SegOption { value: string; label: string }
export function SegToggle({
	options, value, onChange,
}: {
	options: Array<SegOption | string>;
	value: string;
	onChange: (v: string) => void;
}) {
	return (
		<div style={{ display: 'inline-flex', gap: 6 }}>
			{options.map((o) => {
				const v = typeof o === 'string' ? o : o.value;
				const l = typeof o === 'string' ? o : o.label;
				return (
					<button
						key={v}
						className={`chip ${v === value ? 'on' : ''}`}
						style={{ height: 26, padding: '0 10px', fontSize: 11 }}
						onClick={() => onChange(v)}
					>
						{l}
					</button>
				);
			})}
		</div>
	);
}

// ─── YearRangeToggle ──────────────────────────────────────────────────────

export type YearRange = '10y' | '5y' | 'ytd';
export function YearRangeToggle({
	value, onChange,
}: {
	value: YearRange;
	onChange: (v: YearRange) => void;
}) {
	const opts: Array<{ value: YearRange; label: string }> = [
		{ value: '10y', label: '10y' },
		{ value: '5y', label: '5y' },
		{ value: 'ytd', label: 'YTD' },
	];
	return (
		<div style={{ display: 'inline-flex', gap: 4 }}>
			{opts.map((o) => (
				<button
					key={o.value}
					className={`chip ${o.value === value ? 'on' : ''}`}
					style={{
						height: 26,
						padding: '0 10px',
						fontSize: 11,
						fontFamily: 'var(--font-mono)',
						letterSpacing: '0.06em',
						textTransform: 'uppercase',
					}}
					onClick={() => onChange(o.value)}
				>
					{o.label}
				</button>
			))}
		</div>
	);
}

// ─── PieDonut ─────────────────────────────────────────────────────────────

interface PieDonutProps {
	segments: PieSegment[];
	size?: number;
	mode?: 'pie' | 'donut' | 'bar';
	showLabelOnLargest?: boolean;
}

export function PieDonut({
	segments, size = 220, mode = 'pie', showLabelOnLargest = true,
}: PieDonutProps) {
	const [hover, setHover] = useState<number | null>(null);
	const [pos, setPos] = useState({ x: 0, y: 0 });
	const wrapRef = useRef<HTMLDivElement | null>(null);

	const total = segments.reduce((s, x) => s + x.v, 0) || 1;

	// BAR mode — horizontal rows with progress bars
	if (mode === 'bar') {
		return (
			<div style={{ width: '100%' }}>
				{segments.map((s, i) => {
					const pct = (s.v / total) * 100;
					return (
						<div
							key={`${s.name}-${i}`}
							style={{
								padding: '10px 0',
								borderTop: i === 0 ? 'none' : '1px solid var(--border)',
								opacity: hover === null || hover === i ? 1 : 0.55,
								transition: 'opacity .15s',
							}}
							onMouseEnter={() => setHover(i)}
							onMouseLeave={() => setHover(null)}
						>
							<div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, gap: 8 }}>
								<span style={{ width: 8, height: 8, background: s.color, flexShrink: 0 }} />
								<span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{s.name}</span>
								<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', minWidth: 50, textAlign: 'right' }}>
									{pct.toFixed(1)}%
								</span>
								<span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, minWidth: 60, textAlign: 'right' }}>
									{s.label ?? `$${s.v.toLocaleString()}`}
								</span>
							</div>
							<div className="hb-bar" style={{ height: 4 }}>
								<div className="hb-bar-fill" style={{ width: `${pct}%`, background: s.color }} />
							</div>
						</div>
					);
				})}
			</div>
		);
	}

	const r = size / 2;
	const cx = r;
	const cy = r;
	const innerR = mode === 'donut' ? r * 0.58 : 0;

	// Prefix sums give each slice's start offset without a mutable accumulator
	// (admin's react-hooks/immutability rule forbids reassigning a closure var
	// during render).
	const starts: number[] = [];
	segments.reduce((sum, s) => { starts.push(sum); return sum + s.v; }, 0);
	const slices = segments
		.map((s, i) => {
			if (s.v === 0) return null;
			const startVal = starts[i] ?? 0;
			const start = (startVal / total) * Math.PI * 2 - Math.PI / 2;
			const end = ((startVal + s.v) / total) * Math.PI * 2 - Math.PI / 2;
			const big = end - start > Math.PI ? 1 : 0;
			const sx = cx + Math.cos(start) * r;
			const sy = cy + Math.sin(start) * r;
			const ex = cx + Math.cos(end) * r;
			const ey = cy + Math.sin(end) * r;
			const path = mode === 'donut'
				? `M${sx},${sy} A${r},${r} 0 ${big} 1 ${ex},${ey} L${cx + Math.cos(end) * innerR},${cy + Math.sin(end) * innerR} A${innerR},${innerR} 0 ${big} 0 ${cx + Math.cos(start) * innerR},${cy + Math.sin(start) * innerR} Z`
				: `M${cx},${cy} L${sx},${sy} A${r},${r} 0 ${big} 1 ${ex},${ey} Z`;
			const mid = (start + end) / 2;
			return {
				...s,
				idx: i,
				path,
				midX: cx + Math.cos(mid) * (r * 0.65),
				midY: cy + Math.sin(mid) * (r * 0.65),
				pct: (s.v / total) * 100,
			};
		})
		.filter((s): s is NonNullable<typeof s> => s !== null);

	const largest = showLabelOnLargest && slices.length
		? slices.reduce((b, s) => (s.v > b.v ? s : b), slices[0])
		: null;

	const move = (e: React.MouseEvent) => {
		if (!wrapRef.current) return;
		const rect = wrapRef.current.getBoundingClientRect();
		setPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 12 });
	};

	const hoveredSlice = hover !== null ? slices.find((s) => s.idx === hover) : null;

	return (
		<div
			className="pie-wrap"
			ref={wrapRef}
			onMouseLeave={() => setHover(null)}
			style={{ width: size, height: size, position: 'relative' }}
		>
			<svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} style={{ display: 'block' }}>
				{slices.map((s) => (
					<path
						key={s.idx}
						d={s.path}
						fill={s.color}
						opacity={hover === null || hover === s.idx ? 1 : 0.3}
						style={{ cursor: 'pointer', transition: 'opacity .15s' }}
						onMouseEnter={() => setHover(s.idx)}
						onMouseMove={move}
					/>
				))}
				{/* In-slice label only for a single short word — multi-word names like
				    "Venture Capital" overflow the small SVG and get clipped, so we
				    let the legend carry them fully instead of showing a trimmed label. */}
				{largest && largest.pct > 14 && !largest.name.includes(' ') && largest.name.length <= 12 && (
					<text
						x={largest.midX}
						y={largest.midY}
						textAnchor="middle"
						fill="#fff"
						fontSize="12"
						fontWeight="700"
						pointerEvents="none"
						fontFamily="var(--font-display)"
					>
						{largest.name}
					</text>
				)}
			</svg>
			{hoveredSlice && (
				<div className="pie-tip" style={{ left: pos.x, top: pos.y }}>
					<div className="pie-tip-l">{hoveredSlice.name}</div>
					<div className="pie-tip-v">
						{hoveredSlice.label ?? `$${hoveredSlice.v.toLocaleString()}`} · {hoveredSlice.pct.toFixed(1)}%
					</div>
				</div>
			)}
		</div>
	);
}

// ─── PieLegend ────────────────────────────────────────────────────────────

export function PieLegend({ segments }: { segments: PieSegment[] }) {
	const total = segments.reduce((s, x) => s + x.v, 0) || 1;
	return (
		<div className="an-legend">
			{segments.map((s, i) => (
				<div key={`${s.name}-${i}`} className="an-legend-row">
					<span className="an-legend-sw" style={{ background: s.color }} />
					<span className="an-legend-name">{s.name}</span>
					<span className="an-legend-val">{s.label ?? `${((s.v / total) * 100).toFixed(1)}%`}</span>
				</div>
			))}
		</div>
	);
}

// ─── ComboBarLine ─────────────────────────────────────────────────────────

interface ComboBarLineProps {
	data: ComboPoint[];
	height?: number;
	valueFormatter?: (v: number) => string;
	lineFormatter?: (v: number) => string;
	/** Labels under the line ("rounds" by default — pass e.g. "users"). */
	lineLabel?: string;
	barLabel?: string;
}

export function ComboBarLine({
	data, height = 280, valueFormatter, lineFormatter, lineLabel = 'rounds', barLabel = 'Funding',
}: ComboBarLineProps) {
	const [hover, setHover] = useState<number | null>(null);
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const [pos, setPos] = useState({ x: 0, y: 0 });

	const W = 980;
	const H = height;
	const PAD_L = 36;
	const PAD_R = 36;
	const PAD_T = 36;
	const PAD_B = 44;
	const innerW = W - PAD_L - PAD_R;
	const innerH = H - PAD_T - PAD_B;

	const maxAmt = Math.max(1, ...data.map((d) => d.amt)) * 1.15;
	const maxDeals = Math.max(1, ...data.map((d) => d.deals)) * 1.15;

	const bw = Math.min(54, (innerW / Math.max(data.length, 1)) * 0.55);
	const xFor = (i: number) => PAD_L + (i + 0.5) * (innerW / Math.max(data.length, 1));
	const yBar = (v: number) => PAD_T + innerH - (v / maxAmt) * innerH;
	const yLine = (v: number) => PAD_T + innerH - (v / maxDeals) * innerH;

	const fmtAmt = valueFormatter ?? ((v: number) => `$${(v / 1_000_000_000).toFixed(1)}B`);
	const fmtLine = lineFormatter ?? ((v: number) => String(v));

	const onMove = (e: React.MouseEvent) => {
		if (!wrapRef.current) return;
		const rect = wrapRef.current.getBoundingClientRect();
		setPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top + 12 });
	};

	return (
		<div className="cbl-wrap" ref={wrapRef}>
			<svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }} preserveAspectRatio="xMidYMid meet">
				{/* Grid */}
				{[0, 0.25, 0.5, 0.75, 1].map((t) => (
					<g key={t}>
						<line
							x1={PAD_L}
							x2={W - PAD_R}
							y1={PAD_T + innerH * (1 - t)}
							y2={PAD_T + innerH * (1 - t)}
							stroke="var(--grid-line)"
							strokeDasharray="2 4"
						/>
						<text
							x={6}
							y={PAD_T + innerH * (1 - t) + 3}
							fontSize="10"
							fontFamily="var(--font-mono)"
							fill="var(--fg-muted)"
						>
							{fmtAmt(maxAmt * t)}
						</text>
					</g>
				))}

				{/* Bars */}
				{data.map((d, i) => {
					const x = xFor(i) - bw / 2;
					const y = yBar(d.amt);
					const h = PAD_T + innerH - y;
					const fill = i % 2 === 0 ? '#79CABD' : '#C0F4DE';
					return (
						<g key={i}>
							<rect
								x={x}
								y={y}
								width={bw}
								height={h}
								fill={fill}
								opacity={hover === null || hover === i ? 1 : 0.35}
								style={{ cursor: 'pointer', transition: 'opacity .15s' }}
								onMouseEnter={() => setHover(i)}
								onMouseMove={onMove}
								onMouseLeave={() => setHover(null)}
							/>
							<text
								x={xFor(i)}
								y={y - 8}
								textAnchor="middle"
								fontSize="11"
								fontWeight="700"
								fill="var(--fg)"
								fontFamily="var(--font-mono)"
								pointerEvents="none"
							>
								{fmtAmt(d.amt)}
							</text>
							<text
								x={xFor(i)}
								y={H - 14}
								textAnchor="middle"
								fontSize="10"
								fontFamily="var(--font-mono)"
								fill="var(--fg-muted)"
							>
								{d.year ?? d.label}
							</text>
						</g>
					);
				})}

				{/* Trend line */}
				<path
					d={data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xFor(i)},${yLine(d.deals)}`).join(' ')}
					stroke="var(--accent)"
					strokeWidth="1.8"
					fill="none"
				/>
				{data.map((d, i) => (
					<circle
						key={i}
						cx={xFor(i)}
						cy={yLine(d.deals)}
						r="3"
						fill="var(--accent)"
						onMouseEnter={() => setHover(i)}
						onMouseMove={onMove}
						onMouseLeave={() => setHover(null)}
						style={{ cursor: 'pointer' }}
					/>
				))}
			</svg>
			<div className="cbl-legend">
				<span className="cbl-legend-item">
					<span style={{ width: 12, height: 8, background: '#79CABD' }} />
					{barLabel}
				</span>
				<span className="cbl-legend-item">
					<svg width="14" height="6">
						<line x1="0" y1="3" x2="14" y2="3" stroke="var(--accent)" strokeWidth="2" />
					</svg>
					{lineLabel}
				</span>
			</div>
			{hover !== null && data[hover] && (
				<div className="pie-tip" style={{ left: pos.x, top: pos.y }}>
					<div className="pie-tip-l">{data[hover].year ?? data[hover].label}</div>
					<div className="pie-tip-v">{fmtAmt(data[hover].amt)} · {fmtLine(data[hover].deals)} {lineLabel}</div>
				</div>
			)}
		</div>
	);
}

// ─── HBarDrilldown ────────────────────────────────────────────────────────
// Hierarchical horizontal progress rows (up to 3 levels). Rows without
// `children` render as a flat single-level bar (no caret).

export interface HBarRow {
	id: string;
	label: string;
	value: number;
	formatted?: string;
	color?: string;
	children?: HBarRow[];
}

export function HBarDrilldown({
	rows, total, defaultOpen, accordion,
}: {
	rows: HBarRow[];
	total?: number;
	defaultOpen?: Record<string, boolean>;
	/** Single-open top level: expanding one row collapses any other open row. */
	accordion?: boolean;
}) {
	const [openMap, setOpenMap] = useState<Record<string, boolean>>(defaultOpen ?? {});
	const grandTotal = (total ?? rows.reduce((s, r) => s + r.value, 0)) || 1;

	// In accordion mode, opening a row resets the map to just that row — which
	// also collapses the previously-open row and its children.
	const toggle = (id: string) =>
		setOpenMap((o) => (accordion ? (o[id] ? {} : { [id]: true }) : { ...o, [id]: !o[id] }));

	return (
		<div>
			{rows.map((r) => (
				<HBarTop
					key={r.id}
					row={r}
					total={grandTotal}
					open={!!openMap[r.id]}
					onToggle={() => toggle(r.id)}
					openMap={openMap}
					setOpenMap={setOpenMap}
				/>
			))}
		</div>
	);
}

function HBarTop({
	row, total, open, onToggle, openMap, setOpenMap,
}: {
	row: HBarRow;
	total: number;
	open: boolean;
	onToggle: () => void;
	openMap: Record<string, boolean>;
	setOpenMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
	const pct = total > 0 ? (row.value / total) * 100 : 0;
	const hasChildren = !!(row.children && row.children.length);
	return (
		<div
			className={`hb-row ${hasChildren ? 'has-children' : 'no-children'} ${open ? 'open' : ''}`}
			style={{ '--bar-color': row.color } as React.CSSProperties}
			onClick={() => hasChildren && onToggle()}
		>
			<div className="hb-head">
				{hasChildren ? (
					<span className="hb-caret">
						<svg width="9" height="9" viewBox="0 0 10 10"><path d="M3 1l5 4-5 4z" fill="currentColor" /></svg>
					</span>
				) : <span style={{ width: 14 }} />}
				<span className="hb-label">{row.label}</span>
				<span className="hb-pct">{pct.toFixed(1)}%</span>
				<span className="hb-val">{row.formatted ?? `$${row.value}`}</span>
			</div>
			<div className="hb-bar"><div className="hb-bar-fill" style={{ width: `${pct}%` }} /></div>
			{open && hasChildren && (
				<div className="hb-children" onClick={(e) => e.stopPropagation()}>
					{row.children!.map((c) => (
						<HBarChild
							key={c.id}
							row={c}
							total={total}
							barColor={row.color}
							open={!!openMap[c.id]}
							onToggle={() => setOpenMap((o) => ({ ...o, [c.id]: !o[c.id] }))}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function HBarChild({
	row, total, barColor, open, onToggle,
}: {
	row: HBarRow;
	total: number;
	barColor?: string;
	open: boolean;
	onToggle: () => void;
}) {
	const pct = total > 0 ? (row.value / total) * 100 : 0;
	const hasChildren = !!(row.children && row.children.length);
	return (
		<div
			className={`hb-child ${hasChildren ? 'has-children' : ''} ${open ? 'open' : ''}`}
			style={{ '--bar-color': barColor } as React.CSSProperties}
			onClick={() => hasChildren && onToggle()}
		>
			<div className="hb-head">
				{hasChildren ? (
					<span className="hb-caret">
						<svg width="9" height="9" viewBox="0 0 10 10"><path d="M3 1l5 4-5 4z" fill="currentColor" /></svg>
					</span>
				) : <span style={{ width: 14 }} />}
				<span className="hb-label">{row.label}</span>
				<span className="hb-pct">{pct.toFixed(1)}%</span>
				<span className="hb-val">{row.formatted ?? `$${row.value}`}</span>
			</div>
			<div className="hb-bar"><div className="hb-bar-fill" style={{ width: `${pct}%`, background: barColor }} /></div>
			{open && hasChildren && (
				<div className="hb-grandchildren" onClick={(e) => e.stopPropagation()}>
					{row.children!.map((g) => {
						const gpct = total > 0 ? (g.value / total) * 100 : 0;
						return (
							<div key={g.id} className="hb-grandchild">
								<div className="hb-head">
									<span style={{ width: 14 }} />
									<span className="hb-label">{g.label}</span>
									<span className="hb-pct">{gpct.toFixed(1)}%</span>
									<span className="hb-val" style={{ color: 'var(--fg-2)' }}>{g.formatted ?? `$${g.value}`}</span>
								</div>
								<div className="hb-bar">
									<div className="hb-bar-fill" style={{ width: `${gpct}%`, background: barColor }} />
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

// ─── Palette + bucket helpers ───────────────────────────────────────────────

/** Deterministic categorical palette (oklch, theme-agnostic). */
export const CHART_COLORS = [
	'oklch(58% 0.22 14)', 'oklch(62% 0.16 235)', 'oklch(70% 0.16 145)',
	'oklch(72% 0.15 75)', 'oklch(58% 0.20 300)', 'oklch(65% 0.18 25)',
	'oklch(60% 0.14 190)', 'oklch(68% 0.15 110)', 'oklch(55% 0.16 265)',
	'oklch(70% 0.12 50)',
];

export interface Bucket { label: string; value: number }

/** Map `{label,value}` buckets to pie segments with the categorical palette. */
export function toSegments(buckets: Bucket[], opts?: { format?: (v: number) => string }): PieSegment[] {
	return buckets
		.filter((b) => b.value > 0)
		.map((b, i) => ({
			name: b.label,
			v: b.value,
			color: CHART_COLORS[i % CHART_COLORS.length]!,
			label: opts?.format ? opts.format(b.value) : String(b.value),
		}));
}

// ─── Funnel ─────────────────────────────────────────────────────────────────
// Ordered stages with a bar proportional to the largest stage. Used for queue
// status funnels (pending → picked up → verified / rejected).

export interface FunnelStage { label: string; value: number; color?: string }

export function Funnel({ stages }: { stages: FunnelStage[] }) {
	const max = Math.max(1, ...stages.map((s) => s.value));
	return (
		<div style={{ display: 'grid', gap: 10 }}>
			{stages.map((s, i) => {
				const pct = (s.value / max) * 100;
				const color = s.color ?? CHART_COLORS[i % CHART_COLORS.length]!;
				return (
					<div key={s.label}>
						<div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
							<span style={{ fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{s.label.replace(/_/g, ' ')}</span>
							<span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700 }}>{s.value.toLocaleString()}</span>
						</div>
						<div className="hb-bar" style={{ height: 8 }}>
							<div className="hb-bar-fill" style={{ width: `${pct}%`, background: color }} />
						</div>
					</div>
				);
			})}
		</div>
	);
}
