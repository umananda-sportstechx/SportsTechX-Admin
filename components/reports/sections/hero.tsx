'use client';

import { RichText } from '../report-kit/tiptap';
import { SectionIcon } from '../report-kit/icons';

/**
 * Hero — full-bleed cover band. `variant: 'particle'` layers an animated particle
 * canvas (added in the interactive phase); otherwise a gradient/cover-image hero.
 * Content: { subtitle, kpis[]{label,value,delta?,icon?,sublabel?}, cover_url?, variant? }.
 */
export function HeroSection({ content, title }: { content: Record<string, unknown>; title: string | null }) {
	const subtitle = content.subtitle;
	const kpis = (content.kpis as Array<{ label: unknown; value: unknown; delta?: string; icon?: unknown; sublabel?: unknown }>) ?? [];
	const coverUrl = content.cover_url as string | undefined;
	const bg = coverUrl
		? `linear-gradient(180deg, rgba(12,15,26,0.82) 0%, rgba(12,15,26,0.94) 100%), url(${coverUrl}) center / cover`
		: `linear-gradient(135deg, #0c0f1a 0%, var(--rk-title) 100%)`;
	return (
		<div style={{ position: 'relative', overflow: 'hidden', padding: 'clamp(48px, 9vw, 120px) 24px', background: bg, color: '#fff' }}>
			<div style={{ position: 'absolute', top: -120, right: -90, width: 360, height: 360, borderRadius: '50%', background: `radial-gradient(circle, color-mix(in srgb, var(--rk-accent) 28%, transparent), transparent 70%)`, pointerEvents: 'none' }} />
			<div style={{ position: 'relative', maxWidth: 1160, margin: '0 auto' }}>
				{title && (
					<h1 style={{ fontFamily: 'var(--rk-font-display)', fontSize: 'clamp(48px, 8vw, 118px)', lineHeight: 0.92, letterSpacing: '0.01em', margin: '0 0 20px' }}>{title}</h1>
				)}
				{subtitle != null && <p style={{ fontSize: 'clamp(16px, 2vw, 20px)', lineHeight: 1.6, margin: '0 0 36px', maxWidth: 780, color: 'rgba(255,255,255,0.88)' }}><RichText value={subtitle} inline /></p>}
				{kpis.length > 0 && (
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
						{kpis.map((k, i) => (
							<div key={i} style={{ position: 'relative', padding: '24px 22px 20px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', boxShadow: '0 4px 24px rgba(0,0,0,0.35)' }}>
								{k.icon != null && <span style={{ position: 'absolute', top: 16, right: 16, opacity: 0.5 }}><SectionIcon name={k.icon} size={22} color="#fff" /></span>}
								<div style={{ fontFamily: 'var(--rk-font-display)', fontSize: 'clamp(38px, 3.4vw, 52px)', lineHeight: 1, color: 'var(--rk-accent)', paddingRight: 26 }}><RichText value={k.value} inline /></div>
								<div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: 'rgba(255,255,255,0.95)', lineHeight: 1.4 }}><RichText value={k.label} inline /></div>
								{k.sublabel != null && <div style={{ fontSize: 12, lineHeight: 1.45, marginTop: 4, color: 'rgba(255,255,255,0.6)' }}><RichText value={k.sublabel} inline /></div>}
								{k.delta && <div style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 11, marginTop: 6, color: k.delta.startsWith('-') ? '#ff8095' : 'var(--rk-accent)' }}>{k.delta}</div>}
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
