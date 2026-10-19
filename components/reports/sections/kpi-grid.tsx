'use client';

import { RichText } from '../report-kit/tiptap';
import { SectionIcon } from '../report-kit/icons';

/** kpi_grid — big-number stat cards. Content: { columns: 2|3|4, items[]{label,value,hint?,icon?} }. */
export function KpiGridSection({ content }: { content: Record<string, unknown> }) {
	const columns = (content.columns as number) ?? 3;
	const items = (content.items as Array<{ label: unknown; value: unknown; hint?: unknown; icon?: unknown }>) ?? [];
	return (
		<div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${Math.floor(100 / columns)}%), 1fr))`, gap: 12 }}>
			{items.map((it, i) => (
				<div key={i} className="rk-hoverlift" style={{ position: 'relative', padding: '32px 28px', borderRadius: 14, background: 'var(--rk-bg-card)', border: '1px solid var(--rk-border)' }}>
					{it.icon != null && <span style={{ position: 'absolute', top: 18, right: 18, color: 'var(--rk-accent)', opacity: 0.16 }}><SectionIcon name={it.icon} size={30} /></span>}
					<div style={{ fontFamily: 'var(--rk-font-display)', fontSize: 'clamp(40px, 4vw, 60px)', lineHeight: 1, color: 'var(--rk-accent)', paddingRight: 26 }}><RichText value={it.value} inline /></div>
					<div style={{ fontSize: 14, fontWeight: 600, color: 'var(--rk-fg)', marginTop: 8, lineHeight: 1.4 }}><RichText value={it.label} inline /></div>
					{it.hint != null && <div style={{ fontSize: 12, color: 'var(--rk-fg-muted)', lineHeight: 1.45, marginTop: 5 }}><RichText value={it.hint} inline /></div>}
				</div>
			))}
		</div>
	);
}
