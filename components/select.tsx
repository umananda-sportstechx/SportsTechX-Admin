'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check, Search } from 'lucide-react';

export interface SelectOption { value: string; label: string }

/**
 * Styled single-select — a shadcn-style replacement for a native <select>.
 * Trigger looks like a `.search-input`; opens a themed popover listbox with
 * hover/active states, a check on the selected row, click-outside + full
 * keyboard support (↑/↓ to move, Enter to pick, Esc to close). Same value/
 * onChange contract as a native select so call sites don't change.
 */
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
	const ref = useRef<HTMLDivElement>(null);

	const selected = options.find((o) => o.value === value);
	const shown = searchable && query ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase())) : options;

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
		document.addEventListener('mousedown', onDown);
		return () => document.removeEventListener('mousedown', onDown);
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
			{open && (
				<div
					role="listbox"
					style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, minWidth: '100%', maxHeight: 320, overflow: 'hidden', zIndex: 60, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column' }}
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
				</div>
			)}
		</div>
	);
}
