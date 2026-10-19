'use client';

import { RichText } from '../report-kit/tiptap';

/** embed — responsive 16:9 video/iframe. Content: { provider:'youtube'|'vimeo'|'iframe', url, caption? }. */
export function EmbedSection({ content }: { content: Record<string, unknown> }) {
	const url = (content.url as string) ?? '';
	const provider = (content.provider as string) ?? 'iframe';
	const caption = content.caption;
	const embedUrl = (() => {
		if (provider === 'youtube') {
			const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
			return m ? `https://www.youtube.com/embed/${m[1]}` : url;
		}
		if (provider === 'vimeo') {
			const m = url.match(/vimeo\.com\/(\d+)/);
			return m ? `https://player.vimeo.com/video/${m[1]}` : url;
		}
		return url;
	})();
	return (
		<div>
			<div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: 12 }}>
				<iframe src={embedUrl} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation" />
			</div>
			{caption != null && <p style={{ fontSize: 12, color: 'var(--rk-fg-muted)', marginTop: 8, textAlign: 'center' }}><RichText value={caption} inline /></p>}
		</div>
	);
}
