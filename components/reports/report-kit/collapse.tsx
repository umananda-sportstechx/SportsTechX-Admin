'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Smooth max-height expand/collapse (ported from STX AccordionBody). */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);
	const [h, setH] = useState(0);
	useEffect(() => { if (ref.current) setH(ref.current.scrollHeight); }, [open, children]);
	useEffect(() => {
		if (!ref.current || !open) return;
		const ro = new ResizeObserver(() => { if (ref.current) setH(ref.current.scrollHeight); });
		ro.observe(ref.current); return () => ro.disconnect();
	}, [open]);
	return (
		<div style={{ maxHeight: open ? h : 0, opacity: open ? 1 : 0, overflow: 'hidden', overflowAnchor: 'none', transition: 'max-height 0.45s cubic-bezier(0.4,0,0.2,1), opacity 0.45s cubic-bezier(0.4,0,0.2,1)' }}>
			<div ref={ref}>{children}</div>
		</div>
	);
}

/** Expand/collapse "flip" card — title + subtitle + summary that opens to reveal
 *  back paragraphs (the GSTER deep-dive flip card). `color` accents the card. */
export function FlipCard({ title, subtitle, summary, paragraphs, color }: {
	title: string; subtitle?: string; summary?: string; paragraphs: string[]; color?: string;
}) {
	const [open, setOpen] = useState(false);
	const accent = color ?? 'var(--rk-accent)';
	return (
		<div style={{ borderRadius: 10, border: '1px solid var(--rk-border)', overflow: 'hidden' }}>
			<button type="button" onClick={() => setOpen((o) => !o)} style={{ width: '100%', background: open ? `color-mix(in srgb, ${accent} 6%, transparent)` : 'var(--rk-bg-card)', border: 'none', cursor: 'pointer', padding: '22px 22px', textAlign: 'left', transition: 'background 0.3s' }}>
				<div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
					<div style={{ flex: 1 }}>
						<div style={{ fontFamily: 'var(--rk-font-display)', fontSize: 22, lineHeight: 1.1, color: 'var(--rk-title)', marginBottom: 4 }}>{title}</div>
						{subtitle && <div style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 10, letterSpacing: '0.08em', color: accent, textTransform: 'uppercase', marginBottom: 10 }}>{subtitle}</div>}
						{summary && <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--rk-fg-muted)' }}>{summary}</div>}
					</div>
					<span style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 11, color: open ? accent : 'var(--rk-fg-muted)', flexShrink: 0, transition: 'transform 0.3s', transform: open ? 'rotate(180deg)' : 'none', marginTop: 4 }}>▼</span>
				</div>
			</button>
			<Collapse open={open}>
				<div style={{ padding: '0 22px 22px' }}>
					<div style={{ height: 1, background: `color-mix(in srgb, ${accent} 33%, transparent)`, marginBottom: 16 }} />
					{paragraphs.map((p, i) => <p key={i} style={{ fontSize: 13, lineHeight: 1.8, color: 'var(--rk-fg-muted)', marginTop: i > 0 ? 14 : 0 }}>{p}</p>)}
				</div>
			</Collapse>
		</div>
	);
}
