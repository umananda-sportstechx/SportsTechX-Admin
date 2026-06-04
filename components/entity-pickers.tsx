'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { ChevronDown, Search, Star, X } from 'lucide-react';
import { qk } from '@/lib/query-keys';

/**
 * Reference-data pickers for the rich admin entity forms (company / deal /
 * acquisition / investor / ecosystem). They take/return plain ids (or, for
 * investors, `{investor_id?, investor_name, is_lead}`) so the parent form
 * just holds arrays and the backend stores them in the junction tables.
 *
 * Built on the same conventions as `section-pickers.tsx`:
 *   • SWR tuple keys via `qk.reference.*`
 *   • CSS-variable styling + `.search-input` / `.chip` classes
 */

// ─── shared hooks ────────────────────────────────────────────────────────────

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

interface RefRow { id: string; name: string; slug: string; parent_id: string | null; is_bulk_sport?: boolean }

// ─── generic multi-select checkbox dropdown ──────────────────────────────────

function MultiCheckPicker({
	rows, value, onChange, placeholder, loadingMsg,
}: {
	rows: RefRow[];
	value: string[];
	onChange: (ids: string[]) => void;
	placeholder: string;
	loadingMsg: string;
}) {
	const [open, setOpen] = useState(false);
	const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
	const byId = new Map(rows.map((s) => [s.id, s] as const));
	const selectedNames = value.map((id) => byId.get(id)?.name).filter(Boolean) as string[];
	const toggle = (id: string) =>
		onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

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
						? placeholder
						: selectedNames.length <= 3
							? selectedNames.join(', ')
							: `${selectedNames.slice(0, 2).join(', ')} +${selectedNames.length - 2} more`}
				</span>
				<ChevronDown size={12} />
			</button>
			{open && (
				<div style={{
					position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
					marginTop: 2, maxHeight: 320, overflowY: 'auto',
					background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 4,
					boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
				}}>
					{rows.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--fg-muted)' }}>{loadingMsg}</div>}
					{rows.map((s) => {
						const isOn = value.includes(s.id);
						return (
							<label key={s.id} style={{
								display: 'flex', alignItems: 'center', gap: 8,
								padding: '6px 10px', cursor: 'pointer', fontSize: 13,
								background: isOn ? 'var(--bg-3)' : 'transparent',
							}}>
								<input type="checkbox" checked={isOn} onChange={() => toggle(s.id)} />
								<span>{s.name}</span>
								{s.is_bulk_sport && <span style={{ color: 'var(--fg-muted)', fontSize: 11 }}>· group</span>}
							</label>
						);
					})}
				</div>
			)}
		</div>
	);
}

// ─── Sports / Tech-tags multi-select ─────────────────────────────────────────

export function SportsPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
	const { data } = useSWR<RefRow[]>(qk.reference.sports(), { dedupingInterval: 60 * 60_000 });
	return <MultiCheckPicker rows={data ?? []} value={value} onChange={onChange} placeholder="No sports — select…" loadingMsg="Loading sports…" />;
}

export function TechTagsPicker({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) {
	const { data } = useSWR<RefRow[]>(qk.reference.techTags(), { dedupingInterval: 60 * 60_000 });
	return <MultiCheckPicker rows={data ?? []} value={value} onChange={onChange} placeholder="No tech tags — select…" loadingMsg="Loading tech tags…" />;
}

// ─── Round type / currency single selects ────────────────────────────────────

export function RoundTypeSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
	const { data } = useSWR<RefRow[]>(qk.reference.roundTypes(), { dedupingInterval: 60 * 60_000 });
	return (
		<select className="search-input" style={{ width: '100%' }} value={value} onChange={(e) => onChange(e.target.value)}>
			<option value="">— round —</option>
			{(data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
		</select>
	);
}

interface CurrencyRow { code: string; name: string; symbol: string | null }
export function CurrencySelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
	const { data } = useSWR<CurrencyRow[]>(qk.reference.currencies(), { dedupingInterval: 60 * 60_000 });
	return (
		<select className="search-input" style={{ width: '100%' }} value={value} onChange={(e) => onChange(e.target.value)}>
			<option value="">—</option>
			{(data ?? []).map((c) => <option key={c.code} value={c.code}>{c.code}{c.symbol ? ` (${c.symbol})` : ''}</option>)}
		</select>
	);
}

// ─── Sector cascade (Sector → Sub-sector → Sub-sub-sector) ───────────────────
// The rewrite stores a single `sector_id` which may be a leaf. This picker lets
// the admin drill the parent→child hierarchy; the value is always the deepest
// node the admin selected.

export function SectorCascade({ value, onChange }: { value: string; onChange: (sectorId: string) => void }) {
	const { data } = useSWR<RefRow[]>(qk.reference.sectors(), { dedupingInterval: 60 * 60_000 });
	const all = data ?? [];
	const byId = new Map(all.map((s) => [s.id, s] as const));
	const childrenOf = (pid: string | null) => all.filter((s) => s.parent_id === pid);

	// Reconstruct the chosen path (root → … → value) from the flat list.
	const path: string[] = [];
	let cur = value ? byId.get(value) : undefined;
	while (cur) { path.unshift(cur.id); cur = cur.parent_id ? byId.get(cur.parent_id) : undefined; }

	// Render one <select> per level that has options. Level 0 = roots; each
	// subsequent level = children of the previously-chosen node.
	const levels: Array<{ options: RefRow[]; selected: string }> = [];
	let parentId: string | null = null;
	for (let depth = 0; depth < 4; depth++) {
		const options = childrenOf(parentId);
		if (options.length === 0) break;
		const selected = path[depth] ?? '';
		levels.push({ options, selected });
		if (!selected) break;
		parentId = selected;
	}

	const pick = (depth: number, id: string) => {
		// Selecting at a level discards any deeper selection; value becomes the
		// chosen node (or its parent when cleared).
		if (!id) { onChange(path[depth - 1] ?? ''); return; }
		onChange(id);
	};

	return (
		<div style={{ display: 'grid', gap: 6 }}>
			{levels.map((lvl, depth) => (
				<select
					key={depth}
					className="search-input"
					style={{ width: '100%' }}
					value={lvl.selected}
					onChange={(e) => pick(depth, e.target.value)}
				>
					<option value="">{depth === 0 ? '— sector —' : '— more specific (optional) —'}</option>
					{lvl.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
				</select>
			))}
		</div>
	);
}

// ─── Location fields (country + city; backend resolves to location_id) ───────

export interface LocationValue { country: string; city: string }
export function LocationFields({ value, onChange, prefix }: { value: LocationValue; onChange: (v: LocationValue) => void; prefix?: string }) {
	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
			<div>
				<div className="co-stat-label" style={{ marginBottom: 6 }}>{prefix ? `${prefix} country` : 'Country'}</div>
				<input className="search-input" value={value.country} onChange={(e) => onChange({ ...value, country: e.target.value })} />
			</div>
			<div>
				<div className="co-stat-label" style={{ marginBottom: 6 }}>{prefix ? `${prefix} city` : 'City'}</div>
				<input className="search-input" value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} />
			</div>
		</div>
	);
}

// ─── Social links ────────────────────────────────────────────────────────────

export interface SocialValue {
	twitter_url: string;
	instagram_url: string;
	facebook_url: string;
	linkedin_url: string;
	youtube_url: string;
	email: string;
}
export const EMPTY_SOCIAL: SocialValue = { twitter_url: '', instagram_url: '', facebook_url: '', linkedin_url: '', youtube_url: '', email: '' };

export function SocialLinks({ value, onChange }: { value: SocialValue; onChange: (v: SocialValue) => void }) {
	const field = (key: keyof SocialValue, label: string, placeholder: string) => (
		<div>
			<div className="co-stat-label" style={{ marginBottom: 6 }}>{label}</div>
			<input className="search-input" value={value[key]} placeholder={placeholder} onChange={(e) => onChange({ ...value, [key]: e.target.value })} />
		</div>
	);
	return (
		<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
			{field('linkedin_url', 'LinkedIn', 'https://linkedin.com/company/…')}
			{field('twitter_url', 'X / Twitter', 'https://x.com/…')}
			{field('instagram_url', 'Instagram', 'https://instagram.com/…')}
			{field('facebook_url', 'Facebook', 'https://facebook.com/…')}
			{field('youtube_url', 'YouTube', 'https://youtube.com/…')}
			{field('email', 'Email', 'contact@…')}
		</div>
	);
}

// ─── Single company picker (for deal.company_id / acquisition parties) ───────

interface CompanyHit { id: string; name: string; slug: string | null; primary_sector: string | null; hq_country: string | null }

export function CompanySelectOne({
	value, onChange, placeholder = 'Search companies…',
}: { value: string; onChange: (id: string) => void; placeholder?: string }) {
	const [q, setQ] = useState('');
	const [open, setOpen] = useState(false);
	const debouncedQ = useDebounced(q, 200);
	const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));

	const { data: selectedResp } = useSWR<{ data: CompanyHit[] }>(
		value ? ['/api/companies', { ids: value, limit: 1 }] : null,
		{ dedupingInterval: 5 * 60_000 },
	);
	const selected = selectedResp?.data?.[0];

	const { data: searchResp, isLoading } = useSWR<{ data: CompanyHit[] }>(
		debouncedQ.length >= 2 ? ['/api/companies', { q: debouncedQ, limit: 12 }] : null,
		{ dedupingInterval: 30_000, keepPreviousData: true },
	);
	const hits = searchResp?.data ?? [];

	if (value && selected && !open) {
		return (
			<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
				<div className="search-input" style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
					<span style={{ fontWeight: 500 }}>{selected.name}</span>
					{selected.primary_sector && <span style={{ color: 'var(--fg-muted)', marginLeft: 6 }}>· {selected.primary_sector}</span>}
				</div>
				<button type="button" className="btn ghost" onClick={() => { onChange(''); setOpen(true); }}><X size={12} /></button>
			</div>
		);
	}

	return (
		<div ref={ref} style={{ position: 'relative' }}>
			<div style={{ position: 'relative' }}>
				<Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-muted)' }} />
				<input
					className="search-input"
					placeholder={placeholder}
					value={q}
					onChange={(e) => { setQ(e.target.value); setOpen(true); }}
					onFocus={() => setOpen(true)}
					style={{ width: '100%', paddingLeft: 26 }}
				/>
			</div>
			{open && q.length >= 2 && (
				<div style={{
					position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
					marginTop: 2, maxHeight: 280, overflowY: 'auto',
					background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 4,
					boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
				}}>
					{isLoading && <div style={{ padding: 10, fontSize: 12, color: 'var(--fg-muted)' }}>Searching…</div>}
					{hits.map((h) => (
						<button key={h.id} type="button"
							onClick={() => { onChange(h.id); setQ(''); setOpen(false); }}
							style={{ display: 'block', width: '100%', padding: '8px 10px', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--fg)', fontSize: 13 }}
							onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
							onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
							<span style={{ fontWeight: 500 }}>{h.name}</span>
							<span style={{ color: 'var(--fg-muted)' }}>{h.primary_sector ? ` · ${h.primary_sector}` : ''}{h.hq_country ? ` · ${h.hq_country}` : ''}</span>
						</button>
					))}
					{!isLoading && hits.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--fg-muted)' }}>No matches.</div>}
				</div>
			)}
		</div>
	);
}

// ─── Investor picker — typeahead, free-text, lead toggle ─────────────────────

export interface DealInvestor { investor_id?: string; investor_name: string; is_lead: boolean }
interface InvestorHit { id: string; name: string; slug: string | null }

export function InvestorPicker({ value, onChange }: { value: DealInvestor[]; onChange: (v: DealInvestor[]) => void }) {
	const [q, setQ] = useState('');
	const [open, setOpen] = useState(false);
	const debouncedQ = useDebounced(q, 200);
	const containerRef = useClickOutside<HTMLDivElement>(() => setOpen(false));

	const { data: searchResp, isLoading: searching } = useSWR<{ data: InvestorHit[] }>(
		debouncedQ.length >= 2 ? ['/api/investors', { q: debouncedQ, limit: 12 }] : null,
		{ dedupingInterval: 30_000, keepPreviousData: true },
	);
	const selectedIds = new Set(value.map((v) => v.investor_id).filter(Boolean));
	const hits = (searchResp?.data ?? []).filter((h) => !selectedIds.has(h.id));

	const addLinked = (h: InvestorHit) => {
		onChange([...value, { investor_id: h.id, investor_name: h.name, is_lead: false }]);
		setQ(''); setOpen(false);
	};
	const addFreeText = () => {
		const name = q.trim();
		if (!name) return;
		onChange([...value, { investor_name: name, is_lead: false }]);
		setQ(''); setOpen(false);
	};
	const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));
	const toggleLead = (idx: number) => onChange(value.map((v, i) => i === idx ? { ...v, is_lead: !v.is_lead } : v));

	return (
		<div ref={containerRef} style={{ display: 'grid', gap: 6 }}>
			{value.length > 0 && (
				<div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
					{value.map((v, idx) => (
						<div key={`${v.investor_id ?? v.investor_name}-${idx}`} style={{
							display: 'inline-flex', alignItems: 'center', gap: 6,
							padding: '4px 6px', background: 'var(--bg-2)', border: '1px solid var(--border)', fontSize: 12,
						}}>
							<button type="button" onClick={() => toggleLead(idx)} title={v.is_lead ? 'Lead investor' : 'Mark as lead'}
								style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, display: 'inline-flex', color: v.is_lead ? 'var(--accent)' : 'var(--fg-muted)' }}>
								<Star size={12} fill={v.is_lead ? 'var(--accent)' : 'none'} />
							</button>
							<span style={{ fontWeight: 500 }}>{v.investor_name}</span>
							{!v.investor_id && <span style={{ color: 'var(--fg-muted)' }}>· text</span>}
							<button type="button" onClick={() => remove(idx)} title="Remove"
								style={{ background: 'none', border: 0, color: 'var(--fg-muted)', cursor: 'pointer', padding: 2, display: 'inline-flex' }}>
								<X size={12} />
							</button>
						</div>
					))}
				</div>
			)}
			<div style={{ position: 'relative' }}>
				<Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-muted)' }} />
				<input
					className="search-input"
					placeholder="Search investors, or type a name + Enter…"
					value={q}
					onChange={(e) => { setQ(e.target.value); setOpen(true); }}
					onFocus={() => setOpen(true)}
					onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addFreeText(); } }}
					style={{ width: '100%', paddingLeft: 26 }}
				/>
				{open && q.length >= 2 && (
					<div style={{
						position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
						marginTop: 2, maxHeight: 280, overflowY: 'auto',
						background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 4,
						boxShadow: '0 6px 24px rgba(0,0,0,0.15)',
					}}>
						{searching && <div style={{ padding: 10, fontSize: 12, color: 'var(--fg-muted)' }}>Searching…</div>}
						{hits.map((h) => (
							<button key={h.id} type="button" onClick={() => addLinked(h)}
								style={{ display: 'block', width: '100%', padding: '8px 10px', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--fg)', fontSize: 13 }}
								onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
								onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
								{h.name}
							</button>
						))}
						<button type="button" onClick={addFreeText}
							style={{ display: 'block', width: '100%', padding: '8px 10px', textAlign: 'left', background: 'transparent', border: 0, borderTop: '1px solid var(--border)', cursor: 'pointer', color: 'var(--fg-muted)', fontSize: 12 }}>
							+ Add &ldquo;{q.trim()}&rdquo; as free text
						</button>
					</div>
				)}
			</div>
			<div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{value.length} investor(s) · star marks the lead</div>
		</div>
	);
}
