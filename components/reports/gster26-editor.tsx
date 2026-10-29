'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, ChevronUp, ExternalLink, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/confirm';
import { ImageInput } from '@/components/image-input';

/**
 * Editor for GSTER26 — a custom-built report page, not a section report.
 *
 * The page renders `reports.content.<block> ?? <default>` for each editable
 * block, so this edits that `content` document, part by part. The forms are
 * inferred from each block's real shape (the defaults the page itself ships),
 * and Preview is the real page: a hidden iframe of the client's
 * /report-preview/gster26, which re-renders from the draft as you type and is
 * shown full screen on demand.
 */

const ATLAS = process.env.NEXT_PUBLIC_ATLAS_URL ?? 'https://atlas.sportstechx.com';
const ATLAS_ORIGIN = new URL(ATLAS).origin;

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type Content = Record<string, Json>;

/** The page's parts, in page order, and the content blocks each one owns. */
export const GSTER26_PARTS: { id: string; label: string; hint: string; anchor: string; keys: string[] }[] = [
	{ id: 'hero', label: 'Header & hero', hint: 'Top navigation labels, the hero title, intro and the six headline figures.', anchor: '#stx-hero', keys: ['nav', 'hero'] },
	{ id: 'trends', label: 'Trends', hint: 'The section heading, tab names and intros, and the three Trends cards (their long bodies are not editable yet).', anchor: '#trends', keys: ['trendsHeader', 'trendCards'] },
	{ id: 'deep-dives', label: 'Trends · Deep Dives', hint: 'The long-form articles under the Deep Dives tab.', anchor: '#trends', keys: ['featuredArticles'] },
	{ id: 'peak', label: 'PEAK 2026', hint: 'PEAK copy, the Startup World Cup finalists, Groundbreakers and the partner logo wall.', anchor: '#peak2026', keys: ['peakCopy', 'peakSwcFinalists', 'groundbreakersOrgs', 'peakPartnersTier1', 'peakPartnersTier2', 'peakPartnersTier3'] },
	{ id: 'innovators', label: 'Innovators', hint: 'The heading, the three questions, the innovators themselves (name, role, photo, answers) and answer overrides keyed by exact name.', anchor: '#innovators', keys: ['innovatorsHeader', 'innovators', 'innovatorResponses'] },
	{ id: 'startups', label: 'Startups to Watch', hint: 'The heading, tab intros, call to action, and the three tabs of companies.', anchor: '#ecosystem', keys: ['startupsHeader', 'watchInnovators', 'watchPeak', 'watchStxRecommends'] },
	{ id: 'ecomap', label: 'Ecosystem map', hint: 'The map’s heading. Leave the intro empty to use the automatic counts.', anchor: '#ecomap', keys: ['ecomap'] },
	{ id: 'ngsc', label: 'NGSC', hint: 'The New Global Sport Conference panel: copy, images and links.', anchor: '#ngsc', keys: ['ngsc'] },
	{ id: 'data', label: 'Data in Full', hint: 'The section heading, tab names, chart titles and call to action. The data itself comes from the report dataset.', anchor: '#dealflow', keys: ['dataHeader'] },
	{ id: 'closing', label: 'Closing quote', hint: 'The quote that closes the report.', anchor: '#closing', keys: ['closing'] },
];

const LABELS: Record<string, string> = {
	featuredArticles: 'Deep Dive articles', peakSwcFinalists: 'Startup World Cup finalists', groundbreakersOrgs: 'Groundbreakers organisations',
	peakPartnersTier1: 'Partners — tier 1', peakPartnersTier2: 'Partners — tier 2', peakPartnersTier3: 'Partners — tier 3',
	innovatorResponses: 'Innovator answers', watchInnovators: 'Innovators tab', watchPeak: 'PEAK tab', watchStxRecommends: 'Our Picks tab',
	q_innovators: 'Answer: underserved areas', q_investors: 'Answer: emerging technologies', q_sports_orgs: 'Answer: operational areas',
	nav: 'Navigation', hero: 'Hero', trendsHeader: 'Section heading & tabs', trendCards: 'Trend cards', peakCopy: 'PEAK copy',
	innovatorsHeader: 'Section heading & questions', startupsHeader: 'Section heading, tab intros & call to action', ecomap: 'Map heading',
	ngsc: 'NGSC', dataHeader: 'Headings & call to action', closing: 'Closing quote',
	innovators: 'Innovators', designation: 'Role', continent: 'Region (Europe, North America or APAC)', linkedin: 'LinkedIn URL', photo_url: 'Photo', logo_url: 'Organisation logo',
	'ma-sportstech': 'M&A acquirers', 'running-renaissance': 'Competitive running', 'dtc-shift': 'DTC & streaming',
	kpis: 'Headline figures', num: 'Figure', icon: 'Icon (funding, unicorn, investors, globe, trending or ma)',
	titleLine1: 'Title line 1', titleLine2: 'Title line 2 (pink)', titleLine3: 'Title line 3', titleLine4: 'Title line 4', titleYear: 'Year (pink)',
	ctaUrl: 'Button link', ctaLabel: 'Button label', ctaTitle: 'Call-to-action title', ctaText: 'Call-to-action text', ctaSubtitle: 'Call-to-action subtitle',
	videoUrl: 'Video embed URL', stats: 'Stats bar', about: 'About paragraphs (the last one is bold)', pillars: 'Pillars',
};
const humanize = (k: string) => LABELS[k] ?? k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const isImageKey = (k: string) => /logo|photo|image|avatar|img|cover/i.test(k);
const isObj = (v: unknown): v is Record<string, Json> => !!v && typeof v === 'object' && !Array.isArray(v);
const itemTitle = (v: Json, i: number) => (isObj(v) ? String(v.name ?? v.title ?? v.label ?? v.id ?? v.heading ?? `Item ${i + 1}`) : String(v).slice(0, 60) || `Item ${i + 1}`);

/** A blank item shaped like `like` — for "Add" on a list. */
function blankLike(like: Json): Json {
	if (typeof like === 'string') return '';
	if (typeof like === 'number') return 0;
	if (typeof like === 'boolean') return false;
	if (Array.isArray(like)) return [];
	if (isObj(like)) return Object.fromEntries(Object.entries(like).map(([k, v]) => [k, blankLike(v)]));
	return '';
}

// ---- generic, shape-driven form ----------------------------------------------

function Field({ name, value, like, onChange, depth }: { name: string; value: Json | undefined; like: Json | undefined; onChange: (v: Json) => void; depth: number }) {
	const v = value ?? like ?? '';
	if (Array.isArray(v)) return <ListField name={name} value={v} like={Array.isArray(like) ? like : v} onChange={onChange} depth={depth} />;
	if (isObj(v)) {
		return (
			<fieldset className="g26-group" style={{ marginLeft: depth ? 0 : undefined }}>
				{name && <legend>{humanize(name)}</legend>}
				{Object.keys({ ...(isObj(like) ? like : {}), ...v }).map((k) => (
					<Field key={k} name={k} value={v[k]} like={isObj(like) ? like[k] : undefined} depth={depth + 1} onChange={(nv) => onChange({ ...v, [k]: nv })} />
				))}
			</fieldset>
		);
	}
	if (typeof v === 'boolean') {
		return <label className="g26-check"><input type="checkbox" checked={v} onChange={(e) => onChange(e.target.checked)} /> {humanize(name)}</label>;
	}
	if (typeof v === 'number') {
		return <label className="g26-field"><span>{humanize(name)}</span><input className="search-input" type="number" value={v} onChange={(e) => onChange(Number(e.target.value))} /></label>;
	}
	const s = String(v ?? '');
	if (isImageKey(name)) {
		return (
			<div className="g26-field">
				<span>{humanize(name)}</span>
				<div className="g26-img">
					{s && <img src={s.startsWith('/') ? `${ATLAS}${s}` : s} alt="" />}
					<div style={{ flex: 1, minWidth: 0 }}><ImageInput value={s} onChange={(url) => onChange(url)} pathPrefix="reports/gster26" /></div>
				</div>
			</div>
		);
	}
	const long = s.length > 90 || s.includes('\n');
	return (
		<label className="g26-field">
			<span>{humanize(name)}</span>
			{long
				? <textarea className="search-input" rows={Math.min(12, Math.max(3, Math.ceil(s.length / 110)))} value={s} onChange={(e) => onChange(e.target.value)} />
				: <input className="search-input" value={s} onChange={(e) => onChange(e.target.value)} />}
		</label>
	);
}

function ListField({ name, value, like, onChange, depth }: { name: string; value: Json[]; like: Json[]; onChange: (v: Json) => void; depth: number }) {
	const [open, setOpen] = useState<number | null>(null);
	const template = like[0] ?? value[0] ?? '';
	const primitive = !isObj(template) && !Array.isArray(template);
	const move = (i: number, d: number) => { const n = [...value]; const [x] = n.splice(i, 1); n.splice(i + d, 0, x!); onChange(n); setOpen(open === i ? i + d : open); };
	return (
		<div className="g26-list">
			<div className="g26-list__head"><span>{humanize(name)}</span><span className="g26-count">{value.length}</span></div>
			{value.map((item, i) => (
				<div key={i} className="g26-item">
					<div className="g26-item__bar">
						{primitive ? (
							<input className="search-input" value={String(item ?? '')} onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))} />
						) : (
							<button type="button" className="g26-item__toggle" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
								{open === i ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {itemTitle(item, i)}
							</button>
						)}
						<button type="button" className="btn ghost" disabled={i === 0} onClick={() => move(i, -1)} title="Move up"><ChevronUp size={12} /></button>
						<button type="button" className="btn ghost" disabled={i === value.length - 1} onClick={() => move(i, 1)} title="Move down"><ChevronDown size={12} /></button>
						<button type="button" className="btn ghost" onClick={() => { onChange(value.filter((_, j) => j !== i)); setOpen(null); }} title="Remove"><Trash2 size={12} /></button>
					</div>
					{!primitive && open === i && (
						<div className="g26-item__body"><Field name="" value={item} like={template} depth={depth + 1} onChange={(nv) => onChange(value.map((x, j) => (j === i ? nv : x)))} /></div>
					)}
				</div>
			))}
			<button type="button" className="btn ghost g26-add" onClick={() => { onChange([...value, blankLike(template)]); if (!primitive) setOpen(value.length); }}><Plus size={12} /> Add</button>
		</div>
	);
}

// ---- the editor ----------------------------------------------------------------

export function Gster26Editor({ reportId, saved, previewOpen, onClosePreview, onSaved }: {
	reportId: string;
	saved: Content | null;
	previewOpen: boolean;
	onClosePreview: () => void;
	onSaved: () => void;
}) {
	const ask = useConfirm();
	const [draft, setDraft] = useState<Content>(saved ?? {});
	const [defaults, setDefaults] = useState<Content | null>(null);
	const [partId, setPartId] = useState(GSTER26_PARTS[0]!.id);
	const [saving, setSaving] = useState(false);
	const frame = useRef<HTMLIFrameElement>(null);
	const part = GSTER26_PARTS.find((p) => p.id === partId)!;
	const dirty = JSON.stringify(draft) !== JSON.stringify(saved ?? {});
	const partDirty = (p: (typeof GSTER26_PARTS)[number]) => p.keys.some((k) => JSON.stringify(draft[k]) !== JSON.stringify((saved ?? {})[k]));

	useEffect(() => { setDraft(saved ?? {}); }, [saved]);

	// Preview frame: say hello on load, take its defaults, then stream the draft.
	const post = useCallback((msg: unknown) => frame.current?.contentWindow?.postMessage(msg, ATLAS_ORIGIN), []);
	useEffect(() => {
		const onMessage = (e: MessageEvent) => {
			if (e.origin !== ATLAS_ORIGIN || e.source !== frame.current?.contentWindow) return;
			const m = e.data as { type?: string; defaults?: Content };
			if (m?.type === 'gster26:ready' && m.defaults) setDefaults(m.defaults);
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	}, []);
	// Keep saying hello until the frame answers (it may hydrate after onLoad).
	useEffect(() => {
		if (defaults) return;
		const t = setInterval(() => post({ type: 'gster26:hello' }), 800);
		return () => clearInterval(t);
	}, [defaults, post]);
	useEffect(() => {
		if (!defaults) return;
		const t = setTimeout(() => post({ type: 'gster26:content', content: draft }), 120);
		return () => clearTimeout(t);
	}, [draft, defaults, post]);
	useEffect(() => {
		if (previewOpen) post({ type: 'gster26:jump', anchor: part.anchor });
	}, [previewOpen, part.anchor, post]);
	useEffect(() => {
		if (!previewOpen) return;
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClosePreview(); };
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		window.addEventListener('keydown', onKey);
		return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
	}, [previewOpen, onClosePreview]);
	useEffect(() => {
		if (!dirty) return;
		const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
		window.addEventListener('beforeunload', warn);
		return () => window.removeEventListener('beforeunload', warn);
	}, [dirty]);

	const save = async () => {
		setSaving(true);
		try {
			await api('PATCH', `/api/admin/reports/${reportId}`, { content: draft });
			toast.success('Saved — live on the report');
			onSaved();
		} catch (e) { toast.error((e as Error).message); }
		finally { setSaving(false); }
	};
	const resetPart = async () => {
		if (!(await ask(`Reset "${part.label}" to the report’s original copy? Your edits to this part are discarded when you save.`))) return;
		setDraft((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !part.keys.includes(k))) as Content);
	};

	return (
		<>
			<div className="rep-editor">
				<aside className="rep-editor__list">
					<div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>Page parts</div>
					<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
						{GSTER26_PARTS.map((p) => (
							<button key={p.id} type="button" className={`g26-part${p.id === partId ? ' is-active' : ''}`} onClick={() => setPartId(p.id)}>
								<span className="g26-part__label">{p.label}</span>
								<span className="g26-part__meta">{p.keys.length} block{p.keys.length === 1 ? '' : 's'}{partDirty(p) ? ' · edited' : ''}</span>
							</button>
						))}
					</div>
				</aside>

				<main style={{ minWidth: 0 }}>
					<div className="rep-sec">
						<div className="card rep-sec__head">
							<div className="rep-sec__top">
								<span className="rep-sec__kind">{part.label}</span>
								<span className={`rep-chip${dirty ? ' rep-chip--warn' : ''}`}>{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
								<div style={{ flex: 1 }} />
								<button className="btn ghost" onClick={() => void resetPart()} title="Back to the report’s original copy"><RotateCcw size={12} /> Reset part</button>
								<button className="btn" disabled={saving || !dirty} onClick={() => void save()}>{saving ? 'Saving…' : 'Save'}</button>
							</div>
							<div className="rep-sec__hint">{part.hint} Saving publishes straight to the live report.</div>
						</div>
						<div className="card" style={{ padding: 16 }}>
							{!defaults ? (
								<div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>Loading the report’s content…</div>
							) : part.keys.map((k) => (
								<Field key={k} name={k} value={draft[k]} like={defaults[k]} depth={0} onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))} />
							))}
						</div>
					</div>
				</main>
			</div>

			{/* Always mounted so Preview opens instantly and is always current. */}
			<div className={`g26-preview${previewOpen ? ' is-open' : ''}`} aria-hidden={!previewOpen} role={previewOpen ? 'dialog' : undefined} aria-label="Report preview">
				<iframe ref={frame} title="Report preview" src={`${ATLAS}/report-preview/gster26`} onLoad={() => post({ type: 'gster26:hello' })} />
				{previewOpen && (
					<div className="preview-bar">
						<span className="preview-bar__label">Preview · the live page with your unsaved edits</span>
						<a href={`${ATLAS}/reports/gster26`} target="_blank" rel="noopener noreferrer" className="preview-bar__btn" title="The saved, live version">Live page <ExternalLink size={11} /></a>
						<button type="button" className="preview-bar__btn preview-bar__btn--primary" onClick={onClosePreview}><X size={12} /> Close</button>
					</div>
				)}
			</div>
		</>
	);
}
