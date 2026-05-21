'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, GripVertical, Search, X } from 'lucide-react';

/**
 * Pickers used in the section editor wherever the underlying data is a list
 * of UUIDs (company IDs, sector IDs, a poll ID). Non-technical admins
 * shouldn't have to know the UUIDs — they pick by name from a searchable
 * surface and the component hands back the IDs.
 *
 * All three lean on existing endpoints:
 *   • Companies — GET /api/companies?q=...&limit=N + ?ids=a,b,c batch
 *   • Sectors   — GET /api/sectors                  (small reference table)
 *   • Polls     — GET /api/reports/:idOrSlug/polls  (per-report list)
 */

// ─── Shared bits ─────────────────────────────────────────────────────────────

function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
	const ref = useRef<T>(null);
	useEffect(() => {
		const fn = (e: MouseEvent) => {
			const el = ref.current;
			if (!el) return;
			if (e.target instanceof Node && !el.contains(e.target)) onOutside();
		};
		document.addEventListener('mousedown', fn);
		return () => document.removeEventListener('mousedown', fn);
	}, [onOutside]);
	return ref;
}

function useDebounced<T>(value: T, ms = 200): T {
	const [v, setV] = useState(value);
	useEffect(() => {
		const t = setTimeout(() => setV(value), ms);
		return () => clearTimeout(t);
	}, [value, ms]);
	return v;
}

// ─── Company picker — typeahead + chips ──────────────────────────────────────

interface CompanyHit {
	id: string;
	name: string;
	slug: string | null;
	custom_logo_url: string | null;
	primary_sector: string | null;
	hq_country: string | null;
}

export function CompanyPicker({
	value, onChange,
}: { value: string[]; onChange: (ids: string[]) => void }) {
	const [q, setQ] = useState('');
	const [open, setOpen] = useState(false);
	const debouncedQ = useDebounced(q, 200);
	const containerRef = useClickOutside<HTMLDivElement>(() => setOpen(false));

	// Resolve already-selected IDs → full company rows so we can render chips
	// with names + logos. Cached aggressively because the chip list rarely
	// changes outside of explicit edits.
	const idsCsv = value.length > 0 ? value.join(',') : null;
	const { data: selectedResp } = useSWR<{ data: CompanyHit[] }>(
		idsCsv ? ['/api/companies', { ids: idsCsv, limit: value.length }] : null,
		{ dedupingInterval: 5 * 60_000 },
	);
	const byId = new Map((selectedResp?.data ?? []).map((c) => [c.id, c] as const));
	const selectedChips = value.map((id) => byId.get(id) ?? { id, name: id.slice(0, 8) + '…', slug: null, custom_logo_url: null, primary_sector: null, hq_country: null });

	// Typeahead search — only fires when the input has 2+ chars to keep the
	// dropdown empty until the admin is committed to searching.
	const { data: searchResp, isLoading: searching } = useSWR<{ data: CompanyHit[] }>(
		debouncedQ.length >= 2 ? ['/api/companies', { q: debouncedQ, limit: 12 }] : null,
		{ dedupingInterval: 30_000, keepPreviousData: true },
	);
	const hits = (searchResp?.data ?? []).filter((h) => !value.includes(h.id));

	const add = (id: string) => {
		if (value.includes(id)) return;
		onChange([...value, id]);
		setQ('');
		setOpen(false);
	};
	const remove = (id: string) => onChange(value.filter((x) => x !== id));
	const move = (id: string, dir: -1 | 1) => {
		const i = value.indexOf(id);
		if (i < 0) return;
		const j = i + dir;
		if (j < 0 || j >= value.length) return;
		const next = [...value];
		[next[i], next[j]] = [next[j]!, next[i]!];
		onChange(next);
	};

	return (
		<div ref={containerRef} style={{ display: 'grid', gap: 6 }}>
			{/* selected chips */}
			{selectedChips.length > 0 && (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
					{selectedChips.map((c, idx) => (
						<div
							key={c.id}
							style={{
								display: 'inline-flex', alignItems: 'center', gap: 6,
								padding: '4px 6px 4px 4px', background: 'var(--bg-2)',
								border: '1px solid var(--border)', fontSize: 12,
							}}
						>
							<button
								type="button"
								onClick={() => move(c.id, -1)}
								disabled={idx === 0}
								style={{ background: 'none', border: 0, color: 'var(--fg-muted)', cursor: idx === 0 ? 'default' : 'grab', padding: 0, display: 'inline-flex' }}
								title="Move up"
							>
								<GripVertical size={12} />
							</button>
							{c.custom_logo_url && (
								/* eslint-disable-next-line @next/next/no-img-element */
								<img src={c.custom_logo_url} alt="" style={{ width: 16, height: 16, objectFit: 'contain' }} />
							)}
							<span style={{ fontWeight: 500 }}>{c.name}</span>
							{c.primary_sector && <span style={{ color: 'var(--fg-muted)' }}>· {c.primary_sector}</span>}
							<button
								type="button"
								onClick={() => remove(c.id)}
								style={{ background: 'none', border: 0, color: 'var(--fg-muted)', cursor: 'pointer', padding: 2, display: 'inline-flex' }}
								title="Remove"
							>
								<X size={12} />
							</button>
						</div>
					))}
				</div>
			)}

			{/* search input */}
			<div style={{ position: 'relative' }}>
				<Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-muted)' }} />
				<input
					className="search-input"
					placeholder="Search companies by name…"
					value={q}
					onChange={(e) => { setQ(e.target.value); setOpen(true); }}
					onFocus={() => setOpen(true)}
					style={{ width: '100%', paddingLeft: 26 }}
				/>
				{open && (q.length >= 2 || hits.length > 0) && (
					<div
						style={{
							position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
							marginTop: 2, maxHeight: 280, overflowY: 'auto',
							background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 4,
							boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
						}}
					>
						{searching && <div style={{ padding: 10, fontSize: 12, color: 'var(--fg-muted)' }}>Searching…</div>}
						{!searching && hits.length === 0 && q.length >= 2 && (
							<div style={{ padding: 10, fontSize: 12, color: 'var(--fg-muted)' }}>No matches for &ldquo;{q}&rdquo;.</div>
						)}
						{hits.map((h) => (
							<button
								key={h.id}
								type="button"
								onClick={() => add(h.id)}
								style={{
									display: 'flex', alignItems: 'center', gap: 8, width: '100%',
									padding: '8px 10px', textAlign: 'left', background: 'transparent',
									border: 0, cursor: 'pointer', color: 'var(--fg)',
								}}
								onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
								onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
							>
								{h.custom_logo_url ? (
									/* eslint-disable-next-line @next/next/no-img-element */
									<img src={h.custom_logo_url} alt="" style={{ width: 20, height: 20, objectFit: 'contain' }} />
								) : <div style={{ width: 20, height: 20, background: 'var(--bg-3)' }} />}
								<div style={{ flex: 1, minWidth: 0 }}>
									<div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.name}</div>
									<div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
										{h.primary_sector ?? '—'}{h.hq_country ? ` · ${h.hq_country}` : ''}
									</div>
								</div>
							</button>
						))}
					</div>
				)}
			</div>

			<div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
				{value.length} selected{value.length > 0 && ' · arrange with the grip handle, remove with ×'}
			</div>
		</div>
	);
}

// ─── Sector picker — multi-select dropdown ──────────────────────────────────

interface SectorRow {
	id: string;
	slug: string;
	name: string;
	parent_id: string | null;
}

export function SectorPicker({
	value, onChange,
}: { value: string[]; onChange: (ids: string[]) => void }) {
	const [open, setOpen] = useState(false);
	const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
	const { data } = useSWR<SectorRow[]>(['/api/sectors'], { dedupingInterval: 60 * 60_000 });
	const sectors = data ?? [];
	const byId = new Map(sectors.map((s) => [s.id, s] as const));
	const selectedNames = value.map((id) => byId.get(id)?.name).filter(Boolean) as string[];

	const toggle = (id: string) => {
		if (value.includes(id)) onChange(value.filter((x) => x !== id));
		else onChange([...value, id]);
	};

	return (
		<div ref={ref} style={{ position: 'relative' }}>
			<button
				type="button"
				className="search-input"
				onClick={() => setOpen(!open)}
				style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
			>
				<span style={{ color: selectedNames.length === 0 ? 'var(--fg-muted)' : 'var(--fg)' }}>
					{selectedNames.length === 0
						? 'No sectors selected — all sectors'
						: selectedNames.length <= 3
							? selectedNames.join(', ')
							: `${selectedNames.slice(0, 2).join(', ')} +${selectedNames.length - 2} more`}
				</span>
				<ChevronDown size={12} />
			</button>
			{open && (
				<div
					style={{
						position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
						marginTop: 2, maxHeight: 320, overflowY: 'auto',
						background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 4,
						boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
					}}
				>
					{sectors.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--fg-muted)' }}>Loading sectors…</div>}
					{sectors.map((s) => {
						const isOn = value.includes(s.id);
						return (
							<label
								key={s.id}
								style={{
									display: 'flex', alignItems: 'center', gap: 8,
									padding: '6px 10px', cursor: 'pointer', fontSize: 13,
									background: isOn ? 'var(--bg-3)' : 'transparent',
								}}
							>
								<input type="checkbox" checked={isOn} onChange={() => toggle(s.id)} />
								<span>{s.name}</span>
							</label>
						);
					})}
				</div>
			)}
		</div>
	);
}

// ─── Poll picker — single-select for the section's poll_id ──────────────────

interface PollRow {
	id: string;
	question: string;
	is_open: boolean;
	options: Array<{ id: string; label: string }>;
}

export function PollPicker({
	reportId, value, onChange,
}: { reportId: string; value: string | null; onChange: (id: string | null) => void }) {
	const { data, isLoading } = useSWR<PollRow[]>(
		[`/api/reports/${reportId}/polls`],
		{ dedupingInterval: 60_000 },
	);
	const polls = data ?? [];
	return (
		<div style={{ display: 'grid', gap: 4 }}>
			<select
				className="search-input"
				value={value ?? ''}
				onChange={(e) => onChange(e.target.value || null)}
				disabled={isLoading}
				style={{ width: '100%' }}
			>
				<option value="">— select a poll —</option>
				{polls.map((p) => (
					<option key={p.id} value={p.id}>
						{p.question}{p.is_open ? '' : ' (closed)'} · {p.options.length} options
					</option>
				))}
			</select>
			{!isLoading && polls.length === 0 && (
				<div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
					No polls on this report yet. Create one in the Polls tab first, then link it here.
				</div>
			)}
		</div>
	);
}
