'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { RichText } from '../report-kit/tiptap';
import { SectionIcon } from '../report-kit/icons';
import { Collapse, FlipCard } from '../report-kit/collapse';

/**
 * trend_card_list — tabbed editorial cards (trends + deep dives). Each item:
 * icon/eyebrow/title, optional stat, body (always shown), optional flip-cards,
 * and expandable detail + table. Content: { intro?, tabs?[], items[] }.
 */
type FlipDef = { title: string; subtitle?: string; summary?: string; paragraphs?: string[]; color?: string };
type TrendCard = {
	tab?: string; icon?: unknown; eyebrow?: unknown; title: unknown;
	stat?: unknown; stat_label?: unknown; body: Record<string, unknown>;
	detail?: Record<string, unknown>; table?: { headers: string[]; rows: string[][] }; flip_cards?: FlipDef[];
};

export function TrendCardListSection({ content }: { content: Record<string, unknown> }) {
	const intro = content.intro;
	const tabs = (content.tabs as Array<{ key: string; label: unknown }>) ?? [];
	const items = (content.items as TrendCard[]) ?? [];
	const [active, setActive] = useState(tabs[0]?.key ?? '');
	const shown = tabs.length > 0 ? items.filter((it) => (it.tab ?? tabs[0]?.key) === active) : items;
	return (
		<div>
			{intro != null && <p style={{ fontSize: 15, color: 'var(--rk-fg-sec)', margin: '0 0 16px', lineHeight: 1.6 }}><RichText value={intro} inline /></p>}
			{tabs.length > 0 && (
				<div style={{ display: 'flex', gap: 18, borderBottom: '2px solid var(--rk-border)', marginBottom: 24, flexWrap: 'wrap' }}>
					{tabs.map((t) => (
						<button key={t.key} type="button" onClick={() => setActive(t.key)} style={{ padding: '6px 2px', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: 'var(--rk-font-display)', fontSize: 24, letterSpacing: '0.04em', color: active === t.key ? 'var(--rk-accent)' : 'var(--rk-fg-muted)', borderBottom: `3px solid ${active === t.key ? 'var(--rk-accent)' : 'transparent'}`, marginBottom: -2 }}><RichText value={t.label} inline /></button>
					))}
				</div>
			)}
			<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
				{shown.map((it, i) => <TrendItem key={`${active}-${i}`} card={it} />)}
			</div>
		</div>
	);
}

function TrendItem({ card: it }: { card: TrendCard }) {
	const [open, setOpen] = useState(false);
	const hasFlips = !!(it.flip_cards && it.flip_cards.length);
	const hasDetail = !!(it.detail || (it.table && it.table.rows?.length));
	return (
		<div style={{ padding: '28px 24px', borderRadius: 12, display: 'flex', flexDirection: 'column', border: '1px solid var(--rk-border)', background: 'var(--rk-bg-card)' }}>
			<div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
				{it.icon != null && <span style={{ width: 48, height: 48, borderRadius: 12, background: 'color-mix(in srgb, var(--rk-accent) 12%, transparent)', color: 'var(--rk-accent)', display: 'grid', placeItems: 'center', flexShrink: 0 }}><SectionIcon name={it.icon} size={26} /></span>}
				<div style={{ flex: 1, minWidth: 0 }}>
					{it.eyebrow != null && <div style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--rk-fg-muted)', marginBottom: 4 }}><RichText value={it.eyebrow} inline /></div>}
					<h3 style={{ margin: 0, fontFamily: 'var(--rk-font-display)', fontSize: 26, letterSpacing: '0.01em', lineHeight: 1.02, color: 'var(--rk-title)' }}><RichText value={it.title} inline /></h3>
				</div>
			</div>
			{it.stat != null && (
				<div style={{ marginTop: 16 }}>
					<div style={{ fontFamily: 'var(--rk-font-display)', fontSize: 34, color: 'var(--rk-accent)', lineHeight: 1 }}><RichText value={it.stat} inline /></div>
					{it.stat_label != null && <div style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--rk-fg-muted)', marginTop: 4 }}><RichText value={it.stat_label} inline /></div>}
				</div>
			)}
			<div style={{ fontSize: 14, lineHeight: 1.65, color: 'var(--rk-fg-sec)', marginTop: 14 }}><RichText value={it.body} /></div>
			{hasFlips && (
				<div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
					{it.flip_cards!.map((f, i) => <FlipCard key={i} title={f.title} subtitle={f.subtitle} summary={f.summary} paragraphs={f.paragraphs ?? []} color={f.color} />)}
				</div>
			)}
			{hasDetail && (
				<Collapse open={open}>
					<div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--rk-border)', fontSize: 14, lineHeight: 1.6, color: 'var(--rk-fg-sec)' }}>
						{it.detail != null && <RichText value={it.detail} />}
						{it.table && it.table.rows?.length > 0 && (
							<div style={{ overflowX: 'auto', marginTop: 10 }}>
								<table className="rk-table">
									<thead><tr>{it.table.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
									<tbody>{it.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
								</table>
							</div>
						)}
					</div>
				</Collapse>
			)}
			{hasDetail && (
				<button type="button" onClick={() => setOpen((o) => !o)} style={{ marginTop: 16, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 5, border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--rk-accent)', fontFamily: 'var(--rk-font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', padding: 0 }}>
					{open ? 'Close' : 'Read more'} <ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
				</button>
			)}
		</div>
	);
}
