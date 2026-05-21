'use client';

import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useEffect, useRef } from 'react';
import { Bold, Italic, List, ListOrdered, Quote, Heading2, Heading3, Code, Link2, Minus } from 'lucide-react';

/**
 * Shared rich-text editor for section authoring.
 *
 * Two modes:
 *   • block (default) — full StarterKit: paragraphs, h2/h3, lists, blockquote,
 *     code blocks, horizontal rule, plus link. Used for narrative bodies,
 *     quotes, trend card bodies.
 *   • inline — drops the block-level extensions and absorbs Enter so the field
 *     stays single-line-ish. Used for short text fields (subtitles, KPI
 *     labels, captions) where the author wants bold/italic/link emphasis but
 *     not full paragraph structure. Output is still a TipTap doc (root
 *     paragraph + inline marks); the renderer treats it identically.
 *
 * Storage: TipTap JSON. The Zod schema accepts `string | TiptapDoc` for
 * backwards compat with rows authored before this editor existed.
 */
type Mode = 'block' | 'inline';

interface Props {
	value: unknown;                                  // TipTap JSON doc, plain string (legacy), or undefined
	onChange: (doc: Record<string, unknown>) => void;
	placeholder?: string;
	minHeight?: number;
	mode?: Mode;
}

/**
 * Normalises a value into a TipTap doc. Plain strings (the pre-rich-text
 * storage shape) are wrapped in a paragraph; nulls become empty docs.
 */
function toDoc(value: unknown): Record<string, unknown> {
	if (value && typeof value === 'object' && (value as { type?: string }).type === 'doc') {
		return value as Record<string, unknown>;
	}
	if (typeof value === 'string' && value.length > 0) {
		return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: value }] }] };
	}
	return { type: 'doc', content: [] };
}

export function TiptapEditor({ value, onChange, placeholder, minHeight, mode = 'block' }: Props) {
	const inline = mode === 'inline';
	const editor = useEditor({
		extensions: [
			StarterKit.configure(inline
				? {
					// Inline mode: keep ONLY paragraph (required by ProseMirror as the
					// doc root) and the inline marks. Drop every block-level node so
					// the toolbar can't produce headings/lists/blockquotes/etc.
					heading: false,
					bulletList: false,
					orderedList: false,
					listItem: false,
					blockquote: false,
					codeBlock: false,
					horizontalRule: false,
					hardBreak: false,
				}
				: { heading: { levels: [2, 3] } }
			),
			Link.configure({
				openOnClick: false,
				HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
			}),
		],
		content: toDoc(value),
		immediatelyRender: false,
		editorProps: {
			attributes: {
				style: inline
					? `min-height:${minHeight ?? 0}px;outline:none;padding:8px 10px;line-height:1.4;font-size:13px;`
					: `min-height:${minHeight ?? 160}px;outline:none;padding:10px 12px;line-height:1.55;font-size:14px;`,
				class: 'tiptap-content',
			},
			// In inline mode, swallow Enter so the field stays single-line-ish.
			// Shift+Enter still inserts a soft break via the default keymap if
			// hard-break were enabled; we've disabled it, so Enter is a no-op.
			handleKeyDown: inline
				? (_view, event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						return true;
					}
					return false;
				}
				: undefined,
		},
		onUpdate: ({ editor: ed }) => {
			onChange(ed.getJSON() as Record<string, unknown>);
		},
	});

	// External value change → push into editor (e.g. when admin switches sections
	// without unmounting). useRef tracks the last value we PUSHED so we don't
	// loop on our own onUpdate writes.
	const lastPushed = useRef<unknown>(value);
	useEffect(() => {
		if (!editor) return;
		if (value === lastPushed.current) return;
		lastPushed.current = value;
		editor.commands.setContent(toDoc(value) as never, { emitUpdate: false });
	}, [editor, value]);

	if (!editor) {
		return <div style={{ minHeight: (minHeight ?? (inline ? 36 : 160)) + (inline ? 0 : 36), border: '1px solid var(--border)' }} />;
	}

	return (
		<div style={{ border: '1px solid var(--border)', background: 'var(--bg-1)' }}>
			{inline ? <InlineToolbar editor={editor} /> : <Toolbar editor={editor} />}
			<EditorContent editor={editor} />
			{placeholder && editor.isEmpty && (
				<div
					style={{
						pointerEvents: 'none',
						position: 'relative',
						color: 'var(--fg-muted)',
						fontSize: inline ? 12 : 13,
						padding: inline ? '0 10px' : '0 12px',
						marginTop: inline ? -28 : -(minHeight ?? 160) - 6,
						marginBottom: inline ? 8 : (minHeight ?? 160) - 8,
					}}
				>
					{placeholder}
				</div>
			)}
		</div>
	);
}

const BTN_STYLE = (active: boolean): React.CSSProperties => ({
	background: active ? 'var(--bg-3)' : 'transparent',
	border: 'none',
	color: 'var(--fg)',
	padding: '6px 8px',
	cursor: 'pointer',
	display: 'inline-flex',
	alignItems: 'center',
	justifyContent: 'center',
});

function Toolbar({ editor }: { editor: Editor }) {
	return (
		<div style={{ display: 'flex', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
			<button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} style={BTN_STYLE(editor.isActive('heading', { level: 2 }))} title="H2"><Heading2 size={14} /></button>
			<button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} style={BTN_STYLE(editor.isActive('heading', { level: 3 }))} title="H3"><Heading3 size={14} /></button>
			<Sep />
			<button type="button" onClick={() => editor.chain().focus().toggleBold().run()} style={BTN_STYLE(editor.isActive('bold'))} title="Bold"><Bold size={14} /></button>
			<button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} style={BTN_STYLE(editor.isActive('italic'))} title="Italic"><Italic size={14} /></button>
			<Sep />
			<button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} style={BTN_STYLE(editor.isActive('bulletList'))} title="Bullet list"><List size={14} /></button>
			<button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} style={BTN_STYLE(editor.isActive('orderedList'))} title="Numbered list"><ListOrdered size={14} /></button>
			<button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} style={BTN_STYLE(editor.isActive('blockquote'))} title="Quote"><Quote size={14} /></button>
			<button type="button" onClick={() => editor.chain().focus().toggleCodeBlock().run()} style={BTN_STYLE(editor.isActive('codeBlock'))} title="Code"><Code size={14} /></button>
			<Sep />
			<LinkButton editor={editor} />
			<button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()} style={BTN_STYLE(false)} title="Divider"><Minus size={14} /></button>
		</div>
	);
}

function InlineToolbar({ editor }: { editor: Editor }) {
	return (
		<div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-2)' }}>
			<button type="button" onClick={() => editor.chain().focus().toggleBold().run()} style={BTN_STYLE(editor.isActive('bold'))} title="Bold"><Bold size={12} /></button>
			<button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} style={BTN_STYLE(editor.isActive('italic'))} title="Italic"><Italic size={12} /></button>
			<button type="button" onClick={() => editor.chain().focus().toggleCode().run()} style={BTN_STYLE(editor.isActive('code'))} title="Code"><Code size={12} /></button>
			<LinkButton editor={editor} small />
		</div>
	);
}

function Sep() {
	return <span style={{ width: 1, background: 'var(--border)', margin: '0 4px' }} />;
}

function LinkButton({ editor, small }: { editor: Editor; small?: boolean }) {
	return (
		<button
			type="button"
			onClick={() => {
				const prev = editor.getAttributes('link').href as string | undefined;
				const url = window.prompt('Link URL', prev ?? 'https://');
				if (url === null) return;
				if (url === '') return editor.chain().focus().extendMarkRange('link').unsetLink().run();
				editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
			}}
			style={BTN_STYLE(editor.isActive('link'))}
			title="Link"
		>
			<Link2 size={small ? 12 : 14} />
		</button>
	);
}
