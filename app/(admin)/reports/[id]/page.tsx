'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Trash2, Plus, GripVertical, Lock, Unlock, Eye, EyeOff } from 'lucide-react';
import {
	DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors,
	closestCenter,
} from '@dnd-kit/core';
import {
	SortableContext, useSortable, verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '@/lib/api';
import { TiptapEditor } from '@/components/tiptap-editor';
import { CompanyPicker, SectorPicker, PollPicker } from '@/components/section-pickers';

// ---- types matching the server registry --------------------------------------

type SectionKind =
	| 'hero' | 'narrative' | 'kpi_grid' | 'trend_card_list'
	| 'company_grid' | 'deal_table' | 'data_chart'
	| 'poll' | 'quote' | 'embed' | 'ecosystem_map';

const KIND_LABELS: Record<SectionKind, string> = {
	hero: 'Hero',
	narrative: 'Narrative (rich text)',
	kpi_grid: 'KPI grid',
	trend_card_list: 'Trend cards',
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
	company_grid: { mode: 'static', company_ids: [] },
	deal_table: { deal_type: 'funding', query: { limit: 10 } },
	data_chart: { chart_type: 'bar', metric: 'funding_by_year', filters: {} },
	poll: { caption: '' },
	quote: { author: '', body: { type: 'doc', content: [] } },
	embed: { provider: 'youtube', url: '' },
	ecosystem_map: { query: {} },
};

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
			<aside style={{ borderRight: '1px solid var(--border)', paddingRight: 12 }}>
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 6 }}>
					<div style={{ fontWeight: 700, fontSize: 14 }}>Sections</div>
					<div style={{ display: 'flex', gap: 4 }}>
						<Link href={`/reports/${reportId}/preview`} className="btn ghost" title="Preview as user">
							<Eye size={12} />
						</Link>
						<button className="btn" onClick={() => setPickerOpen(!pickerOpen)} title="Add section">
							<Plus size={12} /> Add
						</button>
					</div>
				</div>
				{pickerOpen && <KindPicker onPick={onAddKind} onClose={() => setPickerOpen(false)} />}
				<SectionList
					sections={sections}
					activeId={activeId}
					onSelect={setActiveId}
					onReorder={onReorder}
				/>
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
	const [draft, setDraft] = useState<Section>(initial);
	const [saving, setSaving] = useState(false);

	const patch = (p: Partial<Section>) => setDraft((d) => ({ ...d, ...p }));
	const patchContent = (p: Record<string, unknown>) =>
		setDraft((d) => ({ ...d, content: { ...d.content, ...p } }));

	const save = async () => {
		setSaving(true);
		try {
			await api('PATCH', `/api/admin/reports/${draft.report_id}/sections/${draft.id}`, {
				title: draft.title,
				slug: draft.slug,
				access_tier: draft.access_tier,
				is_published: draft.is_published,
				content: draft.content,
				poll_id: draft.poll_id,
			});
			toast.success('Saved');
			onSaved();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setSaving(false);
		}
	};

	const remove = async () => {
		if (!confirm('Delete this section? This cannot be undone.')) return;
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
			<KindBody section={draft} patchContent={patchContent} onSectionChange={patch} />
		</div>
	);
}

// ---- per-kind editor bodies --------------------------------------------------

function KindBody({
	section, patchContent, onSectionChange,
}: {
	section: Section;
	patchContent: (p: Record<string, unknown>) => void;
	onSectionChange: (p: Partial<Section>) => void;
}) {
	const c = section.content as Record<string, unknown>;
	switch (section.kind) {
		case 'hero':
			return <HeroBody content={c} patch={patchContent} />;
		case 'narrative':
			return <NarrativeBody content={c} patch={patchContent} />;
		case 'kpi_grid':
			return <KpiGridBody content={c} patch={patchContent} />;
		case 'quote':
			return <QuoteBody content={c} patch={patchContent} />;
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
		default:
			return <JsonFallback content={c} patch={(v) => patchContent(v)} />;
	}
}

function FieldLabel({ children }: { children: React.ReactNode }) {
	return <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{children}</div>;
}

function HeroBody({ content, patch }: { content: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
	const subtitle = content.subtitle as unknown;
	const kpis = (content.kpis as Array<{ label: unknown; value: unknown; delta?: string }>) ?? [];
	const coverUrl = (content.cover_url as string) ?? '';
	return (
		<div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
			<div>
				<FieldLabel>Subtitle (rich)</FieldLabel>
				<TiptapEditor mode="inline" value={subtitle} onChange={(doc) => patch({ subtitle: doc })} placeholder="Write the lede…" />
			</div>
			<div>
				<FieldLabel>Cover URL (optional)</FieldLabel>
				<input className="search-input" style={{ width: '100%' }} value={coverUrl} onChange={(e) => patch({ cover_url: e.target.value || undefined })} placeholder="https://…" />
			</div>
			<div>
				<FieldLabel>KPIs ({kpis.length}/8)</FieldLabel>
				<div style={{ display: 'grid', gap: 8 }}>
					{kpis.map((k, i) => (
						<div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px auto', gap: 6, alignItems: 'start' }}>
							<TiptapEditor mode="inline" value={k.label} onChange={(doc) => patch({ kpis: kpis.map((x, j) => j === i ? { ...x, label: doc } : x) })} placeholder="Label" />
							<TiptapEditor mode="inline" value={k.value} onChange={(doc) => patch({ kpis: kpis.map((x, j) => j === i ? { ...x, value: doc } : x) })} placeholder="Value" />
							<input className="search-input" placeholder="Δ %" value={k.delta ?? ''} onChange={(e) => patch({ kpis: kpis.map((x, j) => j === i ? { ...x, delta: e.target.value || undefined } : x) })} />
							<button className="btn ghost" onClick={() => patch({ kpis: kpis.filter((_, j) => j !== i) })}><Trash2 size={12} /></button>
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
	const items = (content.items as Array<{ label: unknown; value: unknown; hint?: unknown }>) ?? [];
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
						<div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr auto', gap: 6, alignItems: 'start' }}>
							<TiptapEditor mode="inline" value={it.label} onChange={(doc) => patch({ items: items.map((x, j) => j === i ? { ...x, label: doc } : x) })} placeholder="Label" />
							<TiptapEditor mode="inline" value={it.value} onChange={(doc) => patch({ items: items.map((x, j) => j === i ? { ...x, value: doc } : x) })} placeholder="Value" />
							<TiptapEditor mode="inline" value={it.hint} onChange={(doc) => patch({ items: items.map((x, j) => j === i ? { ...x, hint: doc } : x) })} placeholder="Hint (optional)" />
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

function QuoteBody({ content, patch }: { content: Record<string, unknown>; patch: (p: Record<string, unknown>) => void }) {
	return (
		<div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: 8 }}>
				<div>
					<FieldLabel>Author</FieldLabel>
					<TiptapEditor mode="inline" value={content.author} onChange={(doc) => patch({ author: doc })} placeholder="Author name" />
				</div>
				<div>
					<FieldLabel>Role (optional)</FieldLabel>
					<TiptapEditor mode="inline" value={content.role} onChange={(doc) => patch({ role: doc })} placeholder="Role / title" />
				</div>
				<div>
					<FieldLabel>Avatar URL (optional)</FieldLabel>
					<input className="search-input" value={(content.avatar_url as string) ?? ''} onChange={(e) => patch({ avatar_url: e.target.value || undefined })} />
				</div>
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
					<FieldLabel>Chart type</FieldLabel>
					<select className="search-input" value={(content.chart_type as string) ?? 'bar'} onChange={(e) => patch({ chart_type: e.target.value })}>
						<option value="bar">bar</option>
						<option value="line">line</option>
						<option value="pie">pie</option>
					</select>
				</div>
				<div>
					<FieldLabel>Metric</FieldLabel>
					<select className="search-input" value={(content.metric as string) ?? 'funding_by_year'} onChange={(e) => patch({ metric: e.target.value })}>
						<option value="funding_by_year">funding by year</option>
						<option value="funding_by_country">funding by country</option>
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
	const items = (content.items as Array<{ title: unknown; body: Record<string, unknown>; table?: { headers: string[]; rows: string[][] } }>) ?? [];
	return (
		<div style={{ display: 'grid', gap: 8 }}>
			{items.map((it, i) => (
				<div key={i} className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
					<div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'start' }}>
						<TiptapEditor mode="inline" value={it.title} onChange={(doc) => patch({ items: items.map((x, j) => j === i ? { ...x, title: doc } : x) })} placeholder="Trend title" />
						<button className="btn ghost" onClick={() => patch({ items: items.filter((_, j) => j !== i) })}><Trash2 size={12} /></button>
					</div>
					<TiptapEditor value={it.body} onChange={(doc) => patch({ items: items.map((x, j) => j === i ? { ...x, body: doc } : x) })} minHeight={120} />
				</div>
			))}
			{items.length < 20 && (
				<button className="btn ghost" onClick={() => patch({ items: [...items, { title: '', body: { type: 'doc', content: [] } }] })}>
					<Plus size={12} /> Add trend card
				</button>
			)}
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
