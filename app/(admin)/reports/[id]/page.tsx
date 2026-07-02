'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Trash2, Plus, GripVertical, Lock, Unlock, Eye, EyeOff, X, Sparkles } from 'lucide-react';
import {
	DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors,
	closestCenter,
} from '@dnd-kit/core';
import {
	SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/confirm';
import { TiptapEditor } from '@/components/tiptap-editor';
import { CompanyPicker, SectorPicker, PollPicker } from '@/components/section-pickers';
import { ImageInput } from '@/components/image-input';

// ---- types matching the server registry --------------------------------------

type SectionKind =
	| 'hero' | 'narrative' | 'kpi_grid' | 'trend_card_list' | 'people_grid'
	| 'company_grid' | 'deal_table' | 'data_chart'
	| 'poll' | 'quote' | 'embed' | 'ecosystem_map';

const KIND_LABELS: Record<SectionKind, string> = {
	hero: 'Hero',
	narrative: 'Narrative (rich text)',
	kpi_grid: 'KPI grid',
	trend_card_list: 'Trend / tabbed cards',
	people_grid: 'People grid',
	company_grid: 'Company grid',
	deal_table: 'Deal table (live)',
	data_chart: 'Data chart (live)',
	poll: 'Poll',
	quote: 'Quote',
	embed: 'Embed',
	ecosystem_map: 'Ecosystem map (live)',
};

const KIND_DEFAULTS: Record<SectionKind, Record<string, unknown>> = {
	hero: { subtitle: '', kpis: [] },
	narrative: { doc: { type: 'doc', content: [] } },
	kpi_grid: { columns: 3, items: [] },
	trend_card_list: { items: [] },
	people_grid: { people: [] },
	company_grid: { mode: 'static', company_ids: [] },
	deal_table: { deal_type: 'funding', query: { limit: 10 } },
	data_chart: { chart_type: 'bar', display: 'chart', metric: 'funding_by_year', filters: {} },
	poll: { caption: '' },
	quote: { author: '', body: { type: 'doc', content: [] } },
	embed: { provider: 'youtube', url: '' },
	ecosystem_map: { query: {} },
};

/** Icon keys usable in hero/kpi/trend cards (must match the client ICONS map). */
const ICON_KEYS = ['', 'dollar-sign', 'trophy', 'users', 'globe', 'trending-up', 'activity', 'bar-chart', 'zap', 'building', 'rocket', 'star', 'heart', 'flag', 'handshake', 'landmark', 'footprints', 'monitor', 'git-merge', 'lightbulb', 'bot'] as const;

interface Section {
	id: string;
	report_id: string;
	kind: SectionKind;
	position: number;
	access_tier: 'free' | 'growth' | 'pro';
	title: string | null;
	slug: string | null;
	is_published: boolean;
	is_live_data: boolean;
	content: Record<string, unknown>;
	poll_id: string | null;
}

// ---- AI generate modal -------------------------------------------------------

function AiGenerateModal(
	{ reportId, onClose, onDone }: { reportId: string; onClose: () => void; onDone: () => void },
) {
	const [brief, setBrief] = useState('');
	const [count, setCount] = useState(6);
	const [busy, setBusy] = useState(false);

	const generate = async () => {
		if (brief.trim().length < 10) {
			toast.error('Give a brief of at least 10 characters.');
			return;
		}
		setBusy(true);
		try {
			const r = await api<{ created: number; skipped: number }>(
				'POST', `/api/admin/reports/${reportId}/ai-generate`, { brief: brief.trim(), count },
			);
			toast.success(`Drafted ${r.created} section${r.created === 1 ? '' : 's'}${r.skipped ? ` · ${r.skipped} skipped` : ''}`);
			onDone();
			onClose();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div
			onClick={onClose}
			style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}
		>
			<div
				onClick={(e) => e.stopPropagation()}
				style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 16, width: 480, maxWidth: '90vw', display: 'grid', gap: 10 }}
			>
				<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
					<Sparkles size={16} />
					<div style={{ fontWeight: 700, flex: 1 }}>Generate sections with AI</div>
					<button className="btn ghost" onClick={onClose} aria-label="Close"><X size={14} /></button>
				</div>
				<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
					Describe the report. The AI drafts unpublished sections you can edit, reorder, and publish.
				</div>
				<textarea
					className="search-input"
					style={{ minHeight: 120, resize: 'vertical' }}
					placeholder="e.g. 2026 European fan-engagement funding overview for an investor audience — key trends, top deals, a funding-by-year chart, and a takeaway."
					value={brief}
					onChange={(e) => setBrief(e.target.value)}
					disabled={busy}
				/>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					<label style={{ fontSize: 12, color: 'var(--fg-2)' }}>
						Sections:
						<input
							type="number" min={3} max={12} value={count}
							onChange={(e) => setCount(Math.min(12, Math.max(3, Number(e.target.value) || 6)))}
							disabled={busy}
							className="search-input"
							style={{ width: 56, marginLeft: 6, display: 'inline-block' }}
						/>
					</label>
					<div style={{ flex: 1 }} />
					<button className="btn" onClick={() => void generate()} disabled={busy}>
						{busy ? 'Generating…' : 'Generate'}
					</button>
				</div>
			</div>
		</div>
	);
}

// ---- page --------------------------------------------------------------------

export default function ReportSectionsEditorPage(
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id: reportId } = use(params);
	const { mutate } = useSWRConfig();
	const { data, isLoading } = useSWR<{ data: Section[] }>(
		[`/api/admin/reports/${reportId}/sections`],
		{ revalidateOnFocus: false },
	);
	const sections = data?.data ?? [];

	const [activeId, setActiveId] = useState<string | null>(null);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [aiOpen, setAiOpen] = useState(false);
	const active = sections.find((s) => s.id === activeId) ?? null;

	const reload = () => mutate((k) => Array.isArray(k) && typeof k[0] === 'string' && k[0].includes(`/admin/reports/${reportId}/sections`));

	const onAddKind = async (kind: SectionKind) => {
		try {
			const created = await api<Section>('POST', `/api/admin/reports/${reportId}/sections`, {
				kind,
				content: KIND_DEFAULTS[kind],
				access_tier: 'free',
				is_published: false,
			});
			toast.success(`${KIND_LABELS[kind]} added`);
			setActiveId(created.id);
			setPickerOpen(false);
			reload();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	const onReorder = async (orderedIds: string[]) => {
		// Optimistic — push reorder into local SWR cache so the user sees instant reorder.
		mutate(
			[`/api/admin/reports/${reportId}/sections`],
			(prev: { data: Section[] } | undefined) => {
				if (!prev) return prev;
				const byId = new Map(prev.data.map((s) => [s.id, s] as const));
				return { data: orderedIds.map((id) => byId.get(id)!).filter(Boolean) };
			},
			{ revalidate: false },
		);
		try {
			await api('POST', `/api/admin/reports/${reportId}/sections/reorder`, { ordered_ids: orderedIds });
		} catch (e) {
			toast.error((e as Error).message);
			reload();
		}
	};

	if (isLoading && sections.length === 0) {
		return <div style={{ padding: 'var(--space-5)' }}>Loading…</div>;
	}

	return (
		<div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, minHeight: 'calc(100vh - var(--topbar-h) - 40px)' }}>
			<aside style={{ borderRight: '1px solid var(--border)', paddingRight: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
				<ReportCoverEditor reportId={reportId} />
				<div>
					<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 6 }}>
						<div style={{ fontWeight: 700, fontSize: 14 }}>Sections</div>
						<div style={{ display: 'flex', gap: 4 }}>
							<Link href={`/reports/${reportId}/preview`} className="btn ghost" title="Preview as user">
								<Eye size={12} />
							</Link>
							<button className="btn" onClick={() => setPickerOpen(!pickerOpen)} title="Add section">
								<Plus size={12} /> Add
							</button>
							<button className="btn ghost" onClick={() => setAiOpen(true)} title="Generate sections with AI">
								<Sparkles size={12} /> AI
							</button>
						</div>
					</div>
					{pickerOpen && <KindPicker onPick={onAddKind} onClose={() => setPickerOpen(false)} />}
					{aiOpen && <AiGenerateModal reportId={reportId} onClose={() => setAiOpen(false)} onDone={reload} />}
					<SectionList
						sections={sections}
						activeId={activeId}
						onSelect={setActiveId}
						onReorder={onReorder}
					/>
				</div>
			</aside>
			<main style={{ overflow: 'hidden' }}>
				{active ? (
					<SectionEditor
						key={active.id}
						section={active}
						onSaved={reload}
						onDeleted={() => { setActiveId(null); reload(); }}
					/>
				) : (
					<div style={{ padding: 'var(--space-5)', color: 'var(--fg-muted)' }}>
						{sections.length === 0
							? 'No sections yet. Click "Add" to create your first section.'
							: 'Select a section to edit.'}
					</div>
				)}
			</main>
		</div>
	);
}

// ---- report cover (shown on the public listing page) ----------------------

function ReportCoverEditor({ reportId }: { reportId: string }) {
	const { mutate } = useSWRConfig();
	const { data: report } = useSWR<{ id: string; cover_url?: string | null }>(
		[`/api/reports/${reportId}`],
		{ revalidateOnFocus: false },
	);
	const [pending, setPending] = useState(false);

	const persistCover = async (url: string) => {
		setPending(true);
		try {
			await api('PATCH', `/api/admin/reports/${reportId}`, { cover_url: url || null });
			// Invalidate every cache entry for this report so the listing
			// grid + detail page both pick up the new cover immediately.
			void mutate((k) =>
				Array.isArray(k) && typeof k[0] === 'string'
				&& (k[0] === '/api/reports' || k[0] === `/api/reports/${reportId}`));
			toast.success('Cover saved');
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setPending(false);
		}
	};

	return (
		<div className="card" style={{ padding: 10, display: 'grid', gap: 6 }}>
			<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
				<div style={{ fontWeight: 700, fontSize: 13 }}>Report cover</div>
				{pending && <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>Saving…</span>}
			</div>
			<div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
				Shown on the reports listing card.
			</div>
			<ImageInput
				value={report?.cover_url ?? ''}
				onChange={(url) => void persistCover(url)}
				pathPrefix={`reports/${reportId}`}
				placeholder="https://… or upload"
			/>
		</div>
	);
}

// ---- kind picker -------------------------------------------------------------

function KindPicker({ onPick, onClose }: { onPick: (k: SectionKind) => void; onClose: () => void }) {
	return (
		<div
			className="card"
			style={{ position: 'absolute', zIndex: 5, padding: 8, marginTop: 4, background: 'var(--bg-1)', display: 'grid', gap: 2, width: 240 }}
		>
			{(Object.keys(KIND_LABELS) as SectionKind[]).map((k) => (
				<button
					key={k}
					onClick={() => onPick(k)}
					style={{
						display: 'block',
						textAlign: 'left',
						padding: '6px 8px',
						border: 'none',
						background: 'transparent',
						cursor: 'pointer',
						color: 'var(--fg)',
						fontSize: 13,
					}}
					onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-3)')}
					onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
				>
					{KIND_LABELS[k]}
				</button>
			))}
			<button className="btn ghost" style={{ marginTop: 6 }} onClick={onClose}>Cancel</button>
		</div>
	);
}

// ---- sortable list -----------------------------------------------------------

function SectionList({
	sections, activeId, onSelect, onReorder,
}: {
	sections: Section[];
	activeId: string | null;
	onSelect: (id: string) => void;
	onReorder: (orderedIds: string[]) => void;
}) {
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
	const ids = sections.map((s) => s.id);

	const handleDragEnd = (e: DragEndEvent) => {
		const { active, over } = e;
		if (!over || active.id === over.id) return;
		const oldIndex = ids.indexOf(active.id as string);
		const newIndex = ids.indexOf(over.id as string);
		if (oldIndex < 0 || newIndex < 0) return;
		onReorder(arrayMove(ids, oldIndex, newIndex));
	};

	return (
		<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
			<SortableContext items={ids} strategy={verticalListSortingStrategy}>
				<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
					{sections.map((s) => (
						<SectionCard key={s.id} section={s} isActive={s.id === activeId} onSelect={() => onSelect(s.id)} />
					))}
				</div>
			</SortableContext>
		</DndContext>
	);
}

function SectionCard({ section: s, isActive, onSelect }: { section: Section; isActive: boolean; onSelect: () => void }) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.id });
	const style: React.CSSProperties = {
		transform: CSS.Transform.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
		background: isActive ? 'var(--bg-3)' : 'var(--bg-1)',
		border: '1px solid var(--border)',
		borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
		padding: '8px 10px',
		display: 'flex',
		alignItems: 'center',
		gap: 8,
		cursor: 'pointer',
	};
	return (
		<div ref={setNodeRef} style={style} onClick={onSelect}>
			<span {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--fg-muted)' }} onClick={(e) => e.stopPropagation()}>
				<GripVertical size={14} />
			</span>
			<div style={{ flex: 1, minWidth: 0 }}>
				<div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
					{s.title || `(${KIND_LABELS[s.kind]})`}
				</div>
				<div style={{ fontSize: 10, color: 'var(--fg-muted)', display: 'flex', gap: 6, marginTop: 2 }}>
					<span>{KIND_LABELS[s.kind]}</span>
					<span style={{ color: s.access_tier === 'pro' ? '#d97706' : s.access_tier === 'growth' ? '#0284c7' : 'var(--fg-muted)' }}>
						· {s.access_tier}
					</span>
					{!s.is_published && <span>· draft</span>}
				</div>
			</div>
		</div>
	);
}

// ---- editor panel ------------------------------------------------------------

function SectionEditor({
	section: initial, onSaved, onDeleted,
}: {
	section: Section;
	onSaved: () => void;
	onDeleted: () => void;
}) {
	const ask = useConfirm();
	const [draft, setDraft] = useState<Section>(initial);
	const [saving, setSaving] = useState(false);

	const patch = (p: Partial<Section>) => setDraft((d) => ({ ...d, ...p }));
	const patchContent = (p: Record<string, unknown>) =>
		setDraft((d) => ({ ...d, content: { ...d.content, ...p } }));

	const persist = async (next: Section) => {
		await api('PATCH', `/api/admin/reports/${next.report_id}/sections/${next.id}`, {
			title: next.title,
			slug: next.slug,
			access_tier: next.access_tier,
			is_published: next.is_published,
			content: next.content,
			poll_id: next.poll_id,
		});
		onSaved();
	};

	const save = async () => {
		setSaving(true);
		try {
			await persist(draft);
			toast.success('Saved');
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setSaving(false);
		}
	};

	/**
	 * Auto-save the section after an image-field commit (upload success, URL
	 * commit, reset). Image edits are single committed events — making the
	 * admin click "Save" after every upload was confusing them into thinking
	 * the field wasn't persisting. Typed-content edits (TipTap, KPI labels,
	 * etc.) still require the explicit Save click; this only fires for image
	 * fields that explicitly opt in via `patchContentAndSave`.
	 *
	 * We pass `next` directly to `persist` because state updates are batched
	 * and `draft` would otherwise be one render stale.
	 */
	const patchContentAndSave = async (p: Record<string, unknown>) => {
		const next: Section = { ...draft, content: { ...draft.content, ...p } };
		setDraft(next);
		try {
			await persist(next);
			toast.success('Saved');
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	const remove = async () => {
		if (!(await ask('Delete this section? This cannot be undone.'))) return;
		try {
			await api('DELETE', `/api/admin/reports/${draft.report_id}/sections/${draft.id}`);
			toast.success('Deleted');
			onDeleted();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	return (
		<div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
			{/* Header bar — common controls */}
			<div className="card" style={{ padding: 12, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto auto auto', gap: 8, alignItems: 'center' }}>
				<input
					className="search-input"
					placeholder="Section title"
					value={draft.title ?? ''}
					onChange={(e) => patch({ title: e.target.value })}
				/>
				<input
					className="search-input"
					placeholder="slug-anchor"
					value={draft.slug ?? ''}
					onChange={(e) => patch({ slug: e.target.value })}
				/>
				<select
					className="search-input"
					value={draft.access_tier}
					onChange={(e) => patch({ access_tier: e.target.value as Section['access_tier'] })}
					title="Tier required to see this section"
				>
					<option value="free">free</option>
					<option value="growth">growth</option>
					<option value="pro">pro</option>
				</select>
				<button
					className="btn ghost"
					title={draft.is_published ? 'Published' : 'Draft'}
					onClick={() => patch({ is_published: !draft.is_published })}
				>
					{draft.is_published ? <Eye size={12} /> : <EyeOff size={12} />} {draft.is_published ? 'Published' : 'Draft'}
				</button>
				<button className="btn" disabled={saving} onClick={() => void save()}>
					{saving ? 'Saving…' : 'Save'}
				</button>
				<button className="btn ghost" onClick={() => void remove()} title="Delete">
					<Trash2 size={12} />
				</button>
			</div>

			<div style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--fg-muted)', fontSize: 12 }}>
				<span>{KIND_LABELS[draft.kind]}</span>
				{draft.is_live_data && <span>· live data</span>}
				{draft.access_tier !== 'free' && (
					<span style={{ color: draft.access_tier === 'pro' ? '#d97706' : '#0284c7' }}>
						<Lock size={11} style={{ verticalAlign: '-1px' }} /> tier-gated to {draft.access_tier}+
					</span>
				)}
				{draft.access_tier === 'free' && <span><Unlock size={11} style={{ verticalAlign: '-1px' }} /> visible to all</span>}
			</div>

			{/* Per-kind body */}
			<KindBody
				section={draft}
				patchContent={patchContent}
				patchContentAndSave={patchContentAndSave}
				onSectionChange={patch}
			/>
		</div>
	);
}

// ---- per-kind editor bodies --------------------------------------------------

function KindBody({
	section, patchContent, patchContentAndSave, onSectionChange,
}: {
	section: Section;
	patchContent: (p: Record<string, unknown>) => void;
	patchContentAndSave: (p: Record<string, unknown>) => Promise<void>;
	onSectionChange: (p: Partial<Section>) => void;
}) {
	const c = section.content as Record<string, unknown>;
	switch (section.kind) {
		case 'hero':
			return <HeroBody content={c} patch={patchContent} patchAndSave={patchContentAndSave} sectionId={section.id} />;
		case 'narrative':
			return <NarrativeBody content={c} patch={patchContent} />;
		case 'kpi_grid':
			return <KpiGridBody content={c} patch={patchContent} />;
		case 'quote':
			return <QuoteBody content={c} patch={patchContent} patchAndSave={patchContentAndSave} sectionId={section.id} />;
		case 'embed':
			return <EmbedBody content={c} patch={patchContent} />;
		case 'deal_table':
			return <DealTableBody content={c} patch={patchContent} />;
		case 'data_chart':
			return <DataChartBody content={c} patch={patchContent} />;
		case 'company_grid':
			return <CompanyGridBody content={c} patch={patchContent} />;
		case 'ecosystem_map':
			return <EcosystemMapBody content={c} patch={patchContent} />;
		case 'poll':
			return <PollBody
				content={c}
				patch={patchContent}
				reportId={section.report_id}
				pollId={section.poll_id}
				setPollId={(id) => onSectionChange({ poll_id: id })}
			/>;
		case 'trend_card_list':
			return <TrendCardListBody content={c} patch={patchContent} />;
		case 'people_grid':
			return <PeopleGridBody content={c} patch={patchContent} patchAndSave={patchContentAndSave} sectionId={section.id} />;
		default:
			return <JsonFallback content={c} patch={(v) => patchContent(v)} />;
	}
}

function FieldLabel({ children }: { children: React.ReactNode }) {
	return <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{children}</div>;
}

function HeroBody({
	content, patch, patchAndSave, sectionId,
}: {
	content: Record<string, unknown>;
	patch: (p: Record<string, unknown>) => void;
	patchAndSave: (p: Record<string, unknown>) => Promise<void>;
	sectionId: string;
}) {
	const subtitle = content.subtitle as unknown;
	const kpis = (content.kpis as Array<{ label: unknown; value: unknown; delta?: string; icon?: string; sublabel?: unknown }>) ?? [];
	const coverUrl = (content.cover_url as string) ?? '';
	return (
		<div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
			<div>
				<FieldLabel>Subtitle (rich)</FieldLabel>
				<TiptapEditor mode="inline" value={subtitle} onChange={(doc) => patch({ subtitle: doc })} placeholder="Write the lede…" />
			</div>
			<div>
				<FieldLabel>Cover image (optional — auto-saves on upload / URL commit / reset)</FieldLabel>
				<ImageInput
					value={coverUrl}
					onChange={(url) => void patchAndSave({ cover_url: url || undefined })}
					pathPrefix={`sections/${sectionId}`}
					placeholder="https://…"
				/>
			</div>
			<div>
				<FieldLabel>KPIs ({kpis.length}/8)</FieldLabel>
				<div style={{ display: 'grid', gap: 8 }}>
					{kpis.map((k, i) => (
						<div key={i} style={{ display: 'grid', gap: 6, border: '1px solid var(--border)', borderRadius: 6, padding: 8 }}>
							<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px 130px auto', gap: 6, alignItems: 'center' }}>
								<TiptapEditor mode="inline" value={k.value} onChange={(doc) => patch({ kpis: kpis.map((x, j) => j === i ? { ...x, value: doc } : x) })} placeholder="Value (e.g. $35.8B)" />
								<TiptapEditor mode="inline" value={k.label} onChange={(doc) => patch({ kpis: kpis.map((x, j) => j === i ? { ...x, label: doc } : x) })} placeholder="Label" />
								<input className="search-input" placeholder="Δ %" value={k.delta ?? ''} onChange={(e) => patch({ kpis: kpis.map((x, j) => j === i ? { ...x, delta: e.target.value || undefined } : x) })} />
								<select className="search-input" value={k.icon ?? ''} onChange={(e) => patch({ kpis: kpis.map((x, j) => j === i ? { ...x, icon: e.target.value || undefined } : x) })}>
									{ICON_KEYS.map((ic) => <option key={ic} value={ic}>{ic || 'no icon'}</option>)}
								</select>
								<button className="btn ghost" onClick={() => patch({ kpis: kpis.filter((_, j) => j !== i) })}><Trash2 size={12} /></button>
							</div>
							<TiptapEditor mode="inline" value={k.sublabel} onChange={(doc) => patch({ kpis: kpis.map((x, j) => j === i ? { ...x, sublabel: doc } : x) })} placeholder="Sublabel (supporting one-liner, optional)" />
						</div>
					))}
					{kpis.length < 8 && (
						<button className="btn ghost" onClick={() => patch({ kpis: [...kpis, { label: '', value: '' }] })}><Plus size={12} /> Add KPI</button>
					)}
				</div>
			</div>
		</div>
	);
}

function NarrativeBody({ content, patch }: { content: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
	return (
		<div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
			<FieldLabel>Body</FieldLabel>
			<TiptapEditor
				value={content.doc}
				onChange={(doc) => patch({ doc })}
				placeholder="Write your narrative…"
				minHeight={280}
			/>
		</div>
	);
}

function KpiGridBody({ content, patch }: { content: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
	const columns = (content.columns as 2 | 3 | 4) ?? 3;
	const items = (content.items as Array<{ label: unknown; value: unknown; hint?: unknown; icon?: string }>) ?? [];
	return (
		<div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
			<div>
				<FieldLabel>Columns</FieldLabel>
				<select className="search-input" value={columns} onChange={(e) => patch({ columns: Number(e.target.value) })}>
					<option value={2}>2</option>
					<option value={3}>3</option>
					<option value={4}>4</option>
				</select>
			</div>
			<div>
				<FieldLabel>Items ({items.length}/12)</FieldLabel>
				<div style={{ display: 'grid', gap: 8 }}>
					{items.map((it, i) => (
						<div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr 130px auto', gap: 6, alignItems: 'center' }}>
							<TiptapEditor mode="inline" value={it.value} onChange={(doc) => patch({ items: items.map((x, j) => j === i ? { ...x, value: doc } : x) })} placeholder="Value" />
							<TiptapEditor mode="inline" value={it.label} onChange={(doc) => patch({ items: items.map((x, j) => j === i ? { ...x, label: doc } : x) })} placeholder="Label" />
							<TiptapEditor mode="inline" value={it.hint} onChange={(doc) => patch({ items: items.map((x, j) => j === i ? { ...x, hint: doc } : x) })} placeholder="Hint (optional)" />
							<select className="search-input" value={it.icon ?? ''} onChange={(e) => patch({ items: items.map((x, j) => j === i ? { ...x, icon: e.target.value || undefined } : x) })}>
								{ICON_KEYS.map((ic) => <option key={ic} value={ic}>{ic || 'no icon'}</option>)}
							</select>
							<button className="btn ghost" onClick={() => patch({ items: items.filter((_, j) => j !== i) })}><Trash2 size={12} /></button>
						</div>
					))}
					{items.length < 12 && (
						<button className="btn ghost" onClick={() => patch({ items: [...items, { label: '', value: '' }] })}><Plus size={12} /> Add item</button>
					)}
				</div>
			</div>
		</div>
	);
}

function QuoteBody({
	content, patch, patchAndSave, sectionId,
}: {
	content: Record<string, unknown>;
	patch: (p: Record<string, unknown>) => void;
	patchAndSave: (p: Record<string, unknown>) => Promise<void>;
	sectionId: string;
}) {
	return (
		<div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
				<div>
					<FieldLabel>Author</FieldLabel>
					<TiptapEditor mode="inline" value={content.author} onChange={(doc) => patch({ author: doc })} placeholder="Author name" />
				</div>
				<div>
					<FieldLabel>Role (optional)</FieldLabel>
					<TiptapEditor mode="inline" value={content.role} onChange={(doc) => patch({ role: doc })} placeholder="Role / title" />
				</div>
			</div>
			<div>
				<FieldLabel>Avatar (optional — auto-saves on upload / URL commit / reset)</FieldLabel>
				<ImageInput
					value={(content.avatar_url as string) ?? ''}
					onChange={(url) => void patchAndSave({ avatar_url: url || undefined })}
					pathPrefix={`sections/${sectionId}`}
					placeholder="https://…"
				/>
			</div>
			<div>
				<FieldLabel>Body</FieldLabel>
				<TiptapEditor value={content.body} onChange={(doc) => patch({ body: doc })} minHeight={120} />
			</div>
		</div>
	);
}

function EmbedBody({ content, patch }: { content: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
	return (
		<div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
			<div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8 }}>
				<div>
					<FieldLabel>Provider</FieldLabel>
					<select className="search-input" value={(content.provider as string) ?? 'youtube'} onChange={(e) => patch({ provider: e.target.value })}>
						<option value="youtube">youtube</option>
						<option value="vimeo">vimeo</option>
						<option value="iframe">iframe</option>
					</select>
				</div>
				<div>
					<FieldLabel>URL</FieldLabel>
					<input className="search-input" style={{ width: '100%' }} value={(content.url as string) ?? ''} onChange={(e) => patch({ url: e.target.value })} placeholder="https://…" />
				</div>
			</div>
			<div>
				<FieldLabel>Caption (optional)</FieldLabel>
				<TiptapEditor mode="inline" value={content.caption} onChange={(doc) => patch({ caption: doc })} placeholder="Caption" />
			</div>
		</div>
	);
}

function DealTableBody({ content, patch }: { content: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
	const q = (content.query as Record<string, unknown>) ?? {};
	const patchQuery = (p: Record<string, unknown>) => patch({ query: { ...q, ...p } });
	return (
		<div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
				<div>
					<FieldLabel>Deal type</FieldLabel>
					<select className="search-input" value={(content.deal_type as string) ?? 'funding'} onChange={(e) => patch({ deal_type: e.target.value })}>
						<option value="funding">funding</option>
						<option value="ma">M&amp;A</option>
					</select>
				</div>
				<div>
					<FieldLabel>Year (optional)</FieldLabel>
					<input className="search-input" type="number" value={(q.year as number) ?? ''} onChange={(e) => patchQuery({ year: e.target.value ? Number(e.target.value) : undefined })} />
				</div>
				<div>
					<FieldLabel>Quarter (optional)</FieldLabel>
					<select className="search-input" value={(q.period as string) ?? ''} onChange={(e) => patchQuery({ period: e.target.value || undefined })}>
						<option value="">all year</option>
						<option value="q1">Q1</option>
						<option value="q2">Q2</option>
						<option value="q3">Q3</option>
						<option value="q4">Q4</option>
					</select>
				</div>
				<div>
					<FieldLabel>Region (optional)</FieldLabel>
					<input className="search-input" value={(q.region as string) ?? ''} onChange={(e) => patchQuery({ region: e.target.value || undefined })} placeholder="e.g. Europe" />
				</div>
				<div>
					<FieldLabel>Limit</FieldLabel>
					<input className="search-input" type="number" value={(q.limit as number) ?? 10} onChange={(e) => patchQuery({ limit: Number(e.target.value) || 10 })} />
				</div>
				<div>
					<FieldLabel>Sort</FieldLabel>
					<select className="search-input" value={(q.sort as string) ?? '-amount'} onChange={(e) => patchQuery({ sort: e.target.value })}>
						<option value="-amount">amount, descending</option>
						<option value="-announced_date">announced date, descending</option>
					</select>
				</div>
			</div>
		</div>
	);
}

function DataChartBody({ content, patch }: { content: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
	const filters = (content.filters as Record<string, unknown>) ?? {};
	const patchFilters = (p: Record<string, unknown>) => patch({ filters: { ...filters, ...p } });
	return (
		<div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
				<div>
					<FieldLabel>Display</FieldLabel>
					<select className="search-input" value={(content.display as string) ?? 'chart'} onChange={(e) => patch({ display: e.target.value })}>
						<option value="chart">chart</option>
						<option value="region_cards">region cards</option>
						<option value="bar_list">bar list</option>
					</select>
				</div>
				<div>
					<FieldLabel>Chart type (when display = chart)</FieldLabel>
					<select className="search-input" value={(content.chart_type as string) ?? 'bar'} onChange={(e) => patch({ chart_type: e.target.value })}>
						<option value="bar">bar</option>
						<option value="line">line</option>
						<option value="pie">pie</option>
					</select>
				</div>
				<div style={{ gridColumn: '1 / -1' }}>
					<FieldLabel>Metric</FieldLabel>
					<select className="search-input" value={(content.metric as string) ?? 'funding_by_year'} onChange={(e) => patch({ metric: e.target.value })}>
						<option value="funding_by_year">funding by year</option>
						<option value="funding_by_country">funding by country</option>
						<option value="funding_by_region">funding by region</option>
						<option value="funding_by_sector">funding by sector</option>
						<option value="funding_by_company">funding by company</option>
						<option value="ma_by_year">M&amp;A by year</option>
					</select>
				</div>
				<div>
					<FieldLabel>Year from</FieldLabel>
					<input className="search-input" type="number" value={(filters.year_from as number) ?? ''} onChange={(e) => patchFilters({ year_from: e.target.value ? Number(e.target.value) : undefined })} />
				</div>
				<div>
					<FieldLabel>Year to</FieldLabel>
					<input className="search-input" type="number" value={(filters.year_to as number) ?? ''} onChange={(e) => patchFilters({ year_to: e.target.value ? Number(e.target.value) : undefined })} />
				</div>
				<div style={{ gridColumn: '1 / -1' }}>
					<FieldLabel>Region (optional)</FieldLabel>
					<input className="search-input" style={{ width: '100%' }} value={(filters.region as string) ?? ''} onChange={(e) => patchFilters({ region: e.target.value || undefined })} placeholder="e.g. Europe" />
				</div>
				<div style={{ gridColumn: '1 / -1' }}>
					<FieldLabel>Sectors (optional — leave empty for all)</FieldLabel>
					<SectorPicker
						value={(filters.sectors as string[]) ?? []}
						onChange={(ids) => patchFilters({ sectors: ids.length > 0 ? ids : undefined })}
					/>
				</div>
			</div>
		</div>
	);
}

function CompanyGridBody({ content, patch }: { content: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
	const mode = ((content.mode as string) ?? 'static') as 'static' | 'live';
	const companyIds = (content.company_ids as string[]) ?? [];
	const query = (content.query as Record<string, unknown>) ?? { limit: 10 };
	const patchQuery = (p: Record<string, unknown>) => patch({ query: { ...query, ...p } });
	return (
		<div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
				<div>
					<FieldLabel>Mode</FieldLabel>
					<select
						className="search-input"
						value={mode}
						onChange={(e) => {
							const m = e.target.value as 'static' | 'live';
							patch(m === 'static'
								? { mode: 'static', company_ids: [], tab_label: content.tab_label }
								: { mode: 'live', query: { limit: 10 }, tab_label: content.tab_label });
						}}
					>
						<option value="static">static (curated)</option>
						<option value="live">live (top N by query)</option>
					</select>
				</div>
				<div>
					<FieldLabel>Tab label (optional)</FieldLabel>
					<TiptapEditor mode="inline" value={content.tab_label} onChange={(doc) => patch({ tab_label: doc })} placeholder="Tab label" />
				</div>
			</div>
			{mode === 'static' ? (
				<div>
					<FieldLabel>Companies</FieldLabel>
					<CompanyPicker
						value={companyIds}
						onChange={(ids) => patch({ company_ids: ids })}
					/>
				</div>
			) : (
				<div style={{ display: 'grid', gap: 8 }}>
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
						<div>
							<FieldLabel>Country (optional)</FieldLabel>
							<input className="search-input" value={(query.country as string) ?? ''} onChange={(e) => patchQuery({ country: e.target.value || undefined })} />
						</div>
						<div>
							<FieldLabel>Limit</FieldLabel>
							<input className="search-input" type="number" value={(query.limit as number) ?? 10} onChange={(e) => patchQuery({ limit: Number(e.target.value) || 10 })} />
						</div>
						<div>
							<FieldLabel>Sort</FieldLabel>
							<select className="search-input" value={(query.sort as string) ?? '-total_funding'} onChange={(e) => patchQuery({ sort: e.target.value })}>
								<option value="-total_funding">total funding, desc</option>
								<option value="-created_at">added at, desc</option>
								<option value="name">name, asc</option>
							</select>
						</div>
					</div>
					<div>
						<FieldLabel>Funding stages (optional — comma-separated, e.g. seed, series_a)</FieldLabel>
						<input
							className="search-input"
							style={{ width: '100%' }}
							value={((query.stages as string[]) ?? []).join(', ')}
							onChange={(e) => {
								const stages = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
								patchQuery({ stages: stages.length > 0 ? stages : undefined });
							}}
							placeholder="seed, series_a, series_b"
						/>
					</div>
					<div>
						<FieldLabel>Sectors (optional — leave empty for all)</FieldLabel>
						<SectorPicker
							value={(query.sectors as string[]) ?? []}
							onChange={(ids) => patchQuery({ sectors: ids.length > 0 ? ids : undefined })}
						/>
					</div>
				</div>
			)}
		</div>
	);
}

function EcosystemMapBody({ content, patch }: { content: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
	const query = (content.query as Record<string, unknown>) ?? {};
	const patchQuery = (p: Record<string, unknown>) => patch({ query: { ...query, ...p } });
	return (
		<div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
			<div>
				<FieldLabel>Region (optional)</FieldLabel>
				<input className="search-input" style={{ width: '100%' }} value={(query.region as string) ?? ''} onChange={(e) => patchQuery({ region: e.target.value || undefined })} placeholder="e.g. EMEA" />
			</div>
			<div>
				<FieldLabel>Sectors (optional — leave empty for all)</FieldLabel>
				<SectorPicker
					value={(query.sectors as string[]) ?? []}
					onChange={(ids) => patchQuery({ sectors: ids.length > 0 ? ids : undefined })}
				/>
			</div>
		</div>
	);
}

function PollBody({
	content, patch, reportId, pollId, setPollId,
}: {
	content: Record<string, unknown>;
	patch: (p: Record<string, unknown>) => void;
	reportId: string;
	pollId: string | null;
	setPollId: (id: string | null) => void;
}) {
	return (
		<div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
			<div>
				<FieldLabel>Poll</FieldLabel>
				<PollPicker reportId={reportId} value={pollId} onChange={setPollId} />
			</div>
			<div>
				<FieldLabel>Caption (optional)</FieldLabel>
				<TiptapEditor mode="inline" value={content.caption} onChange={(doc) => patch({ caption: doc })} placeholder="Caption (defaults to the poll question)" />
			</div>
		</div>
	);
}

function TrendCardListBody({ content, patch }: { content: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
	const intro = content.intro as unknown;
	const tabs = (content.tabs as Array<{ key: string; label: unknown }>) ?? [];
	const items = (content.items as Array<{ tab?: string; icon?: string; eyebrow?: unknown; title: unknown; stat?: unknown; stat_label?: unknown; body: Record<string, unknown>; detail?: Record<string, unknown>; table?: { headers: string[]; rows: string[][] } }>) ?? [];
	return (
		<div style={{ display: 'grid', gap: 10 }}>
			<div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
				<FieldLabel>Intro (optional)</FieldLabel>
				<TiptapEditor mode="inline" value={intro} onChange={(doc) => patch({ intro: doc })} placeholder="Section intro line…" />
				<FieldLabel>Tabs (optional — group cards; leave empty for no tabs)</FieldLabel>
				{tabs.map((t, i) => (
					<div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 1fr auto', gap: 6, alignItems: 'center' }}>
						<input className="search-input" value={t.key} onChange={(e) => patch({ tabs: tabs.map((x, j) => j === i ? { ...x, key: e.target.value } : x) })} placeholder="key (e.g. trends)" />
						<TiptapEditor mode="inline" value={t.label} onChange={(doc) => patch({ tabs: tabs.map((x, j) => j === i ? { ...x, label: doc } : x) })} placeholder="Tab label" />
						<button className="btn ghost" onClick={() => patch({ tabs: tabs.filter((_, j) => j !== i) })}><Trash2 size={12} /></button>
					</div>
				))}
				{tabs.length < 6 && <button className="btn ghost" onClick={() => patch({ tabs: [...tabs, { key: '', label: '' }] })}><Plus size={12} /> Add tab</button>}
			</div>
			{items.map((it, i) => (
				<div key={i} className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
					<div style={{ display: 'grid', gridTemplateColumns: '130px 130px 1fr auto', gap: 6, alignItems: 'center' }}>
						<select className="search-input" value={it.tab ?? ''} onChange={(e) => patch({ items: items.map((x, j) => j === i ? { ...x, tab: e.target.value || undefined } : x) })}>
							<option value="">(no tab)</option>
							{tabs.map((t) => <option key={t.key} value={t.key}>{t.key}</option>)}
						</select>
						<select className="search-input" value={it.icon ?? ''} onChange={(e) => patch({ items: items.map((x, j) => j === i ? { ...x, icon: e.target.value || undefined } : x) })}>
							{ICON_KEYS.map((ic) => <option key={ic} value={ic}>{ic || 'no icon'}</option>)}
						</select>
						<TiptapEditor mode="inline" value={it.eyebrow} onChange={(doc) => patch({ items: items.map((x, j) => j === i ? { ...x, eyebrow: doc } : x) })} placeholder="Eyebrow / kicker (optional)" />
						<button className="btn ghost" onClick={() => patch({ items: items.filter((_, j) => j !== i) })}><Trash2 size={12} /></button>
					</div>
					<TiptapEditor mode="inline" value={it.title} onChange={(doc) => patch({ items: items.map((x, j) => j === i ? { ...x, title: doc } : x) })} placeholder="Card title" />
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
						<TiptapEditor mode="inline" value={it.stat} onChange={(doc) => patch({ items: items.map((x, j) => j === i ? { ...x, stat: doc } : x) })} placeholder="Stat (optional)" />
						<TiptapEditor mode="inline" value={it.stat_label} onChange={(doc) => patch({ items: items.map((x, j) => j === i ? { ...x, stat_label: doc } : x) })} placeholder="Stat label (optional)" />
					</div>
					<FieldLabel>Summary (always visible)</FieldLabel>
					<TiptapEditor value={it.body} onChange={(doc) => patch({ items: items.map((x, j) => j === i ? { ...x, body: doc } : x) })} minHeight={90} />
					<FieldLabel>Detail (revealed on &ldquo;Read more&rdquo; — optional)</FieldLabel>
					<TiptapEditor value={it.detail} onChange={(doc) => patch({ items: items.map((x, j) => j === i ? { ...x, detail: doc } : x) })} minHeight={90} />
					<TrendCardTableEditor table={it.table} onChange={(table) => patch({ items: items.map((x, j) => j === i ? { ...x, table } : x) })} />
				</div>
			))}
			{items.length < 40 && (
				<button className="btn ghost" onClick={() => patch({ items: [...items, { title: '', body: { type: 'doc', content: [] } }] })}>
					<Plus size={12} /> Add card
				</button>
			)}
		</div>
	);
}

function PeopleGridBody({
	content, patch, patchAndSave, sectionId,
}: {
	content: Record<string, unknown>;
	patch: (p: Record<string, unknown>) => void;
	patchAndSave: (p: Record<string, unknown>) => Promise<void>;
	sectionId: string;
}) {
	const intro = content.intro as unknown;
	const regions = (content.regions as Array<{ key: string; label: unknown; color?: string }>) ?? [];
	const people = (content.people as Array<{ name: unknown; org?: unknown; region?: string; photo_url?: string; detail?: unknown; link?: string }>) ?? [];
	return (
		<div style={{ display: 'grid', gap: 10 }}>
			<div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
				<FieldLabel>Intro (optional)</FieldLabel>
				<TiptapEditor mode="inline" value={intro} onChange={(doc) => patch({ intro: doc })} placeholder="Section intro line…" />
				<FieldLabel>Regions (optional — for the colour legend + ring colour)</FieldLabel>
				{regions.map((r, i) => (
					<div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 110px auto', gap: 6, alignItems: 'center' }}>
						<input className="search-input" value={r.key} onChange={(e) => patch({ regions: regions.map((x, j) => j === i ? { ...x, key: e.target.value } : x) })} placeholder="key (e.g. europe)" />
						<TiptapEditor mode="inline" value={r.label} onChange={(doc) => patch({ regions: regions.map((x, j) => j === i ? { ...x, label: doc } : x) })} placeholder="Label" />
						<input className="search-input" type="color" value={r.color ?? '#5B7FFF'} onChange={(e) => patch({ regions: regions.map((x, j) => j === i ? { ...x, color: e.target.value } : x) })} />
						<button className="btn ghost" onClick={() => patch({ regions: regions.filter((_, j) => j !== i) })}><Trash2 size={12} /></button>
					</div>
				))}
				{regions.length < 8 && <button className="btn ghost" onClick={() => patch({ regions: [...regions, { key: '', label: '', color: '#5B7FFF' }] })}><Plus size={12} /> Add region</button>}
			</div>
			{people.map((p, i) => (
				<div key={i} className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 140px auto', gap: 6, alignItems: 'center' }}>
						<TiptapEditor mode="inline" value={p.name} onChange={(doc) => patch({ people: people.map((x, j) => j === i ? { ...x, name: doc } : x) })} placeholder="Name" />
						<TiptapEditor mode="inline" value={p.org} onChange={(doc) => patch({ people: people.map((x, j) => j === i ? { ...x, org: doc } : x) })} placeholder="Org / role" />
						<select className="search-input" value={p.region ?? ''} onChange={(e) => patch({ people: people.map((x, j) => j === i ? { ...x, region: e.target.value || undefined } : x) })}>
							<option value="">(no region)</option>
							{regions.map((r) => <option key={r.key} value={r.key}>{r.key}</option>)}
						</select>
						<button className="btn ghost" onClick={() => patch({ people: people.filter((_, j) => j !== i) })}><Trash2 size={12} /></button>
					</div>
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
						<ImageInput value={p.photo_url ?? ''} onChange={(url) => void patchAndSave({ people: people.map((x, j) => j === i ? { ...x, photo_url: url || undefined } : x) })} pathPrefix={`sections/${sectionId}`} placeholder="Photo URL" />
						<input className="search-input" value={p.link ?? ''} onChange={(e) => patch({ people: people.map((x, j) => j === i ? { ...x, link: e.target.value || undefined } : x) })} placeholder="Profile link (optional)" />
					</div>
					<FieldLabel>Detail (shown in the click-through panel — optional)</FieldLabel>
					<TiptapEditor mode="inline" value={p.detail} onChange={(doc) => patch({ people: people.map((x, j) => j === i ? { ...x, detail: doc } : x) })} placeholder="Bio / quote…" />
				</div>
			))}
			{people.length < 80 && (
				<button className="btn ghost" onClick={() => patch({ people: [...people, { name: '' }] })}><Plus size={12} /> Add person</button>
			)}
		</div>
	);
}

/**
 * Optional table sub-editor for a trend card. Mirrors the section-kinds
 * `table: { headers: string[]; rows: string[][] }` shape. Renderers (admin +
 * client) display the table when present.
 */
function TrendCardTableEditor({ table, onChange }: { table?: { headers: string[]; rows: string[][] }; onChange: (t: { headers: string[]; rows: string[][] } | undefined) => void }) {
	if (!table) {
		return (
			<button className="btn ghost" style={{ justifySelf: 'start' }} onClick={() => onChange({ headers: ['', ''], rows: [['', '']] })}>
				<Plus size={12} /> Add table
			</button>
		);
	}
	const cols = table.headers.length;
	const setHeader = (c: number, v: string) => onChange({ ...table, headers: table.headers.map((h, j) => j === c ? v : h) });
	const setCell = (r: number, c: number, v: string) => onChange({ ...table, rows: table.rows.map((row, ri) => ri === r ? row.map((cell, ci) => ci === c ? v : cell) : row) });
	const addRow = () => onChange({ ...table, rows: [...table.rows, Array(cols).fill('')] });
	const addCol = () => onChange({ headers: [...table.headers, ''], rows: table.rows.map((row) => [...row, '']) });
	const removeRow = (r: number) => onChange({ ...table, rows: table.rows.filter((_, ri) => ri !== r) });

	return (
		<div className="card" style={{ padding: 10, display: 'grid', gap: 6, background: 'var(--bg-2, transparent)' }}>
			<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
				<FieldLabel>Table</FieldLabel>
				<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => onChange(undefined)}><Trash2 size={11} /> Remove table</button>
			</div>
			<table className="data-table" style={{ width: '100%' }}>
				<thead>
					<tr>
						{table.headers.map((h, c) => (
							<th key={c}><input className="search-input" style={{ width: '100%', fontWeight: 700 }} value={h} onChange={(e) => setHeader(c, e.target.value)} placeholder={`Col ${c + 1}`} /></th>
						))}
						<th style={{ width: 32 }} />
					</tr>
				</thead>
				<tbody>
					{table.rows.map((row, r) => (
						<tr key={r}>
							{Array.from({ length: cols }).map((_, c) => (
								<td key={c}><input className="search-input" style={{ width: '100%' }} value={row[c] ?? ''} onChange={(e) => setCell(r, c, e.target.value)} /></td>
							))}
							<td><button className="btn ghost" style={{ padding: '2px 6px' }} onClick={() => removeRow(r)}><X size={11} /></button></td>
						</tr>
					))}
				</tbody>
			</table>
			<div style={{ display: 'flex', gap: 6 }}>
				{table.rows.length < 50 && <button className="btn ghost" onClick={addRow}><Plus size={11} /> Row</button>}
				{cols < 8 && <button className="btn ghost" onClick={addCol}><Plus size={11} /> Column</button>}
			</div>
		</div>
	);
}

function JsonFallback({ content, patch }: { content: Record<string, unknown>; patch: (v: Record<string, unknown>) => void }) {
	const [text, setText] = useState(() => JSON.stringify(content, null, 2));
	const [err, setErr] = useState<string | null>(null);
	return (
		<div className="card" style={{ padding: 12 }}>
			<FieldLabel>Raw JSON (no dedicated editor yet)</FieldLabel>
			<textarea
				className="search-input"
				style={{ width: '100%', minHeight: 280, fontFamily: 'var(--font-mono)', fontSize: 12 }}
				value={text}
				onChange={(e) => {
					setText(e.target.value);
					try {
						const v = JSON.parse(e.target.value);
						patch(v);
						setErr(null);
					} catch (parseErr) {
						setErr((parseErr as Error).message);
					}
				}}
			/>
			{err && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{err}</div>}
		</div>
	);
}
