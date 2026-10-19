'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { RichText } from '../report-kit/tiptap';
import { SectionIcon } from '../report-kit/icons';
import { Collapse } from '../report-kit/collapse';

/**
 * accordion — colour-coded category accordions (the FTABR26 World Cup tech
 * groups). One group open at a time. Content:
 * { intro?, groups[]{ key, label, color?, icon?, body?(doc), items?[]{title, body?(doc), detail?} } }.
 */
type Grp = { key?: string; label: unknown; color?: string; icon?: unknown; body?: Record<string, unknown>; items?: Array<{ title: unknown; body?: Record<string, unknown>; detail?: unknown }> };

export function AccordionSection({ content }: { content: Record<string, unknown> }) {
	const intro = content.intro;
	const groups = (content.groups as Grp[]) ?? [];
	const [open, setOpen] = useState<string | null>(null);
	return (
		<div>
			{intro != null && <p style={{ fontSize: 15, color: 'var(--rk-fg-sec)', margin: '0 0 16px', lineHeight: 1.6 }}><RichText value={intro} inline /></p>}
			<div style={{ display: 'grid', gap: 10 }}>
				{groups.map((g, gi) => {
					const key = g.key ?? String(gi);
					const isOpen = open === key;
					const accent = g.color ?? 'var(--rk-accent)';
					return (
						<div key={key} style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--rk-border)', borderTop: `3px solid ${accent}` }}>
							<button type="button" onClick={() => setOpen(isOpen ? null : key)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '18px 22px', border: 0, background: isOpen ? `color-mix(in srgb, ${accent} 7%, transparent)` : 'var(--rk-bg-card)', cursor: 'pointer', textAlign: 'left' }}>
								{g.icon != null && <span style={{ color: accent }}><SectionIcon name={g.icon} size={22} /></span>}
								<span style={{ flex: 1, fontFamily: 'var(--rk-font-display)', fontSize: 24, color: 'var(--rk-title)' }}><RichText value={g.label} inline /></span>
								<ChevronDown size={18} style={{ color: accent, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform .3s' }} />
							</button>
							<Collapse open={isOpen}>
								<div style={{ padding: '4px 22px 22px' }}>
									{g.body != null && <div style={{ fontSize: 14, lineHeight: 1.7, color: 'var(--rk-fg-sec)', marginBottom: g.items?.length ? 16 : 0 }}><RichText value={g.body} /></div>}
									{g.items && g.items.length > 0 && (
										<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
											{g.items.map((it, i) => (
												<div key={i} style={{ padding: '16px 18px', borderRadius: 10, background: 'var(--rk-bg)', border: '1px solid var(--rk-border)', borderLeft: `3px solid ${accent}` }}>
													<div style={{ fontWeight: 700, fontSize: 14, color: 'var(--rk-fg)', marginBottom: 6 }}><RichText value={it.title} inline /></div>
													{it.body != null && <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--rk-fg-muted)' }}><RichText value={it.body} /></div>}
													{it.detail != null && <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--rk-fg-muted)', marginTop: 6 }}><RichText value={it.detail} inline /></div>}
												</div>
											))}
										</div>
									)}
								</div>
							</Collapse>
						</div>
					);
				})}
			</div>
		</div>
	);
}
