'use client';

import { RichText } from '../report-kit/tiptap';

/** narrative — long-form prose. Content: { doc: &lt;TipTap doc&gt; }. */
export function NarrativeSection({ content }: { content: Record<string, unknown> }) {
	return (
		<div style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--rk-fg-sec)', maxWidth: 760 }}>
			<RichText value={content.doc} />
		</div>
	);
}
