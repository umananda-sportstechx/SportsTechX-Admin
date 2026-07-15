'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface SelectOption { value: string; label: string }

/**
 * Styled single-select — a shadcn-style replacement for a native <select>.
 * Trigger looks like a `.search-input`; opens a themed popover listbox with
 * hover/active states, a check on the selected row, click-outside + full
 * keyboard support (↑/↓ to move, Enter to pick, Esc to close). Same value/
 * onChange contract as a native select so call sites don't change.
 *
 * The popover renders in a portal with fixed positioning anchored to the
 * trigger, so it floats ABOVE scrollable containers (modals, cards) instead of
 * being clipped by their overflow, and flips upward when there's no room below.
 */
const MENU_MAX = 320;

export function Select({
	value, onChange, options, placeholder = 'Select…', ariaLabel, width, height = 32, searchable = false, style,
}: {
	value: string;
	onChange: (v: string) => void;
	options: SelectOption[];
	placeholder?: string;
	ariaLabel?: string;
	width?: number | string;
	height?: number;
	/** Show a filter box at the top of the menu (turns it into a combobox). */
	searchable?: boolean;
	/** Merged into the outer wrapper (e.g. flex: 1). */
	style?: React.CSSProperties;
}) {
	const [open, setOpen] = useState(false);
	const [active, setActive] = useState(0);
	const [query, setQuery] = useState('');
	const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxH: number } | null>(null);
	const ref = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	const selected = options.find((o) => o.value === value);
	const shown = searchable && query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;

	// Position the portaled menu against the trigger; flip up if it won't fit below.
	const place = () => {
		const el = ref.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		const below = window.innerHeight - r.bottom - 8;
		const above = r.top - 8;
		const openUp = below < Math.min(MENU_MAX, 220) && above > below;
		// At least 200px wide so a narrow trigger (e.g. a currency box) still gets a
		// readable, non-truncated list; clamped to stay inside the viewport.
		const width = Math.min(Math.max(r.width, 200), window.innerWidth - 16);
		const left = Math.max(8, Math.min(r.left, window.innerWidth - 8 - width));
		setPos(openUp
			? { bottom: window.innerHeight - r.top + 4, left, width, maxH: Math.min(MENU_MAX, above) }
			: { top: r.bottom + 4, left, width, maxH: Math.min(MENU_MAX, below) });
	};

	useEffect(() => { if (open) place(); }, [open]);
	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			const t = e.target as Node;
			if (ref.current?.contains(t) || menuRef.current?.contains(t)) return;
			setOpen(false);
		};
		const reposition = () => place();
		document.addEventListener('mousedown', onDown);
		window.addEventListener('resize', reposition);
		window.addEventListener('scroll', reposition, true);
		return () => {
			document.removeEventListener('mousedown', onDown);
			window.removeEventListener('resize', reposition);
			window.removeEventListener('scroll', reposition, true);
		};
	}, [open]);
	useEffect(() => { if (open) { setQuery(''); setActive(Math.max(0, options.findIndex((o) => o.value === value))); } }, [open, value, options]);
	useEffect(() => { setActive(0); }, [query]);

	const choose = (v: string) => { onChange(v); setOpen(false); };
	const onKey = (e: React.KeyboardEvent) => {
		if (!open) {
			if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); }
			return;
		}
		if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
		else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
		else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
		else if (e.key === 'Enter') { e.preventDefault(); const o = shown[active]; if (o) choose(o.value); }
	};

	return (
		<div ref={ref} style={{ position: 'relative', flex: '0 0 auto', ...style }}>
			<button
				type="button"
				className="search-input"
				aria-label={ariaLabel}
				aria-haspopup="listbox"
				aria-expanded={open}
				onClick={() => setOpen((o) => !o)}
				onKeyDown={onKey}
				style={{ height, minWidth: width ?? 130, width, display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', textAlign: 'left' }}
			>
				<span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: selected?.value ? 'var(--fg)' : 'var(--fg-muted)' }}>
					{selected?.label ?? placeholder}
				</span>
				<ChevronDown size={14} style={{ opacity: 0.6, flexShrink: 0, transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }} />
			</button>
			{open && pos && createPortal(
				<div
					ref={menuRef}
					role="listbox"
					style={{
						position: 'fixed', left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom,
						maxHeight: pos.maxH, overflow: 'hidden', zIndex: 2000,
						background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
						boxShadow: 'var(--shadow-lg, var(--shadow-md))', display: 'flex', flexDirection: 'column',
					}}
				>
					{searchable && (
						<div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
							<Search size={13} style={{ color: 'var(--fg-muted)', flexShrink: 0 }} />
							{/* eslint-disable-next-line jsx-a11y/no-autofocus */}
							<input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} placeholder="Search…"
								style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', color: 'var(--fg)', fontSize: 13 }} />
						</div>
					)}
					<div style={{ overflow: 'auto', padding: 4 }}>
						{shown.length === 0 && <div style={{ padding: '8px', fontSize: 12, color: 'var(--fg-muted)' }}>No matches</div>}
						{shown.map((o, i) => (
							<div
								key={o.value}
								role="option"
								aria-selected={o.value === value}
								onMouseEnter={() => setActive(i)}
								onClick={() => choose(o.value)}
								style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13, background: i === active ? 'var(--bg-2)' : 'transparent', whiteSpace: 'nowrap' }}
							>
								<Check size={13} style={{ opacity: o.value === value ? 1 : 0, color: 'var(--accent)', flexShrink: 0 }} />
								<span>{o.label}</span>
							</div>
						))}
					</div>
				</div>,
				document.body,
			)}
		</div>
	);
}
