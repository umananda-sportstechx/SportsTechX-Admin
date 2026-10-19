'use client';

import type { ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';

/**
 * Read-only TipTap JSON renderer for report rich-text. Ported from the admin
 * SectionRenderer; colors come from the report CSS vars (--rk-*) the ReportView
 * sets, so it themes per report and in dark/light. A `richText` field may be a
 * plain string or a TipTap doc — `RichText` handles both.
 */
interface TiptapNode {
	type: string;
	text?: string;
	attrs?: Record<string, unknown>;
	marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
	content?: TiptapNode[];
}

export function RichText({ value, inline }: { value: unknown; inline?: boolean }) {
	if (value == null) return null;
	if (typeof value === 'string') return <>{value}</>;
	if (typeof value !== 'object') return null;
	return inline ? <TiptapInline node={value as TiptapNode} /> : <TiptapNodeRenderer node={value as TiptapNode} />;
}

function TiptapInline({ node }: { node: TiptapNode }) {
	const out: ReactNode[] = [];
	const walk = (n: TiptapNode, key: string): void => {
		if (n.type === 'text') { out.push(<TiptapText key={key} text={n.text ?? ''} marks={n.marks} />); return; }
		if (n.type === 'hardBreak') { out.push(<br key={key} />); return; }
		if (Array.isArray(n.content)) n.content.forEach((child, i) => walk(child, `${key}-${i}`));
	};
	walk(node, '0');
	return <>{out}</>;
}

function TiptapNodeRenderer({ node }: { node: TiptapNode }) {
	const children = node.content?.map((c, i) => <TiptapNodeRenderer key={i} node={c} />);
	switch (node.type) {
		case 'doc': return <>{children}</>;
		case 'paragraph': return <p style={{ margin: '0 0 0.85em', lineHeight: 1.65 }}>{children}</p>;
		case 'heading': {
			const Tag = (`h${(node.attrs?.level as number) ?? 2}`) as 'h2' | 'h3';
			return <Tag style={{ margin: '1.4em 0 0.5em', fontWeight: 700, fontFamily: 'var(--rk-font-display)', color: 'var(--rk-title)' }}>{children}</Tag>;
		}
		case 'bulletList': return <ul style={{ paddingLeft: 24, margin: '0 0 0.85em', lineHeight: 1.6 }}>{children}</ul>;
		case 'orderedList': return <ol style={{ paddingLeft: 24, margin: '0 0 0.85em', lineHeight: 1.6 }}>{children}</ol>;
		case 'listItem': return <li style={{ margin: '0 0 0.3em' }}>{children}</li>;
		case 'blockquote': return <blockquote style={{ borderLeft: '3px solid var(--rk-accent)', paddingLeft: 14, margin: '0 0 0.85em', color: 'var(--rk-fg-sec)' }}>{children}</blockquote>;
		case 'codeBlock': return <pre style={{ background: 'var(--rk-bg-sec)', padding: 12, overflowX: 'auto', borderRadius: 8 }}><code>{children}</code></pre>;
		case 'horizontalRule': return <hr style={{ border: 0, borderTop: '1px solid var(--rk-border)', margin: '1.2em 0' }} />;
		case 'hardBreak': return <br />;
		case 'text': return <TiptapText text={node.text ?? ''} marks={node.marks} />;
		default: return <>{children}</>;
	}
}

function TiptapText({ text, marks }: { text: string; marks?: Array<{ type: string; attrs?: Record<string, unknown> }> }) {
	let node: ReactNode = text;
	if (!marks) return <>{node}</>;
	for (const m of marks) {
		if (m.type === 'bold') node = <strong>{node}</strong>;
		else if (m.type === 'italic') node = <em>{node}</em>;
		else if (m.type === 'code') node = <code style={{ background: 'var(--rk-bg-sec)', padding: '0 4px', borderRadius: 3 }}>{node}</code>;
		else if (m.type === 'link') {
			const href = (m.attrs?.href as string) ?? '#';
			node = <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--rk-accent)' }}>{node} <ExternalLink size={10} style={{ verticalAlign: -1 }} /></a>;
		}
	}
	return <>{node}</>;
}
