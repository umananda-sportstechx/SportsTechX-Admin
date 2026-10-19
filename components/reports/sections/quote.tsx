'use client';

import { RichText } from '../report-kit/tiptap';

/** quote — pull-quote card. Content: { author, role?, avatar_url?, body(doc) }. */
export function QuoteSection({ content }: { content: Record<string, unknown> }) {
	const { author, role } = content;
	const avatarUrl = content.avatar_url as string | undefined;
	return (
		<blockquote style={{ position: 'relative', padding: 'clamp(28px, 4vw, 44px)', margin: 0, borderRadius: 16, background: `linear-gradient(135deg, var(--rk-title) 0%, #0c0f1a 100%)`, color: '#fff', overflow: 'hidden' }}>
			<span style={{ position: 'absolute', top: 4, left: 22, fontFamily: 'var(--rk-font-display)', fontSize: 120, lineHeight: 1, color: 'var(--rk-accent)', opacity: 0.25, pointerEvents: 'none' }}>&ldquo;</span>
			<div style={{ position: 'relative', fontSize: 'clamp(20px, 2.4vw, 30px)', lineHeight: 1.4, fontWeight: 300, marginBottom: 20 }}><RichText value={content.body} /></div>
			<footer style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
				{avatarUrl && (
					/* eslint-disable-next-line @next/next/no-img-element */
					<img src={avatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: '50%', border: `2px solid var(--rk-accent)` }} />
				)}
				<div>
					<div style={{ fontFamily: 'var(--rk-font-display)', fontSize: 20, letterSpacing: '0.02em' }}><RichText value={author} inline /></div>
					{role != null && <div style={{ fontFamily: 'var(--rk-font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)' }}><RichText value={role} inline /></div>}
				</div>
			</footer>
		</blockquote>
	);
}
