'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { GripVertical, ImageOff, Plus, Trash2 } from 'lucide-react';
import {
	DndContext, DragOverlay, PointerSensor, closestCenter, pointerWithin,
	useDraggable, useDroppable, useSensor, useSensors,
	type CollisionDetection, type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '@/lib/api';
import { useConfirm } from '@/components/confirm';
import { AsyncState, Section } from '@/components/atoms';
import { PLACEMENTS_KEY, type Asset, type Placement, type SectionSpec } from './shared';

/* eslint-disable @next/next/no-img-element */

/**
 * Placements: which asset shows where, on one site.
 *
 * One DndContext covers three drop interactions:
 *   library tile -> a section          adds a card at the end
 *   library tile -> a card's logo box  sets that card's company logo
 *   card -> card (same section)        reorders
 *
 * Drag ids are namespaced so onDragEnd can tell them apart: `lib:<assetId>` for
 * a tray tile, `logo:<placementId>` for a logo drop box, `sec:<section>` for a
 * section body, and a bare uuid for a placed card (which is what useSortable
 * registers).
 */
export function PlacementBoard({
	site, sections, placements, assets, loading, error, reload, mutatePlacements,
}: {
	site: string;
	sections: [string, SectionSpec][];
	placements: Placement[];
	assets: Asset[];
	loading: boolean;
	error: unknown;
	reload: () => void;
	mutatePlacements: (next: Placement[]) => void;
}) {
	const [dragging, setDragging] = useState<string | null>(null);
	const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

	const bySection = (name: string) =>
		placements.filter((p) => p.section === name).sort((a, b) => a.position - b.position);

	const addCard = async (section: string, assetId: string | null) => {
		try {
			await api('POST', PLACEMENTS_KEY, { site, section, asset_id: assetId });
			reload();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	const setOverlay = async (placementId: string, assetId: string | null) => {
		try {
			await api('PATCH', `${PLACEMENTS_KEY}/${placementId}`, { overlay_asset_id: assetId });
			reload();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	const reorder = async (section: string, orderedIds: string[]) => {
		// Optimistic: rewrite positions locally so the card lands where it was
		// dropped instead of snapping back for the round trip.
		const rank = new Map(orderedIds.map((id, i) => [id, i] as const));
		mutatePlacements(placements.map((p) => (rank.has(p.id) ? { ...p, position: rank.get(p.id)! } : p)));
		try {
			await api('POST', `${PLACEMENTS_KEY}/reorder`, { site, section, ordered_ids: orderedIds });
		} catch (e) {
			toast.error((e as Error).message);
			reload();
		}
	};

	const onDragEnd = (e: DragEndEvent) => {
		setDragging(null);
		const activeId = String(e.active.id);
		const overId = e.over ? String(e.over.id) : null;
		if (!overId) return;

		if (activeId.startsWith('lib:')) {
			const assetId = activeId.slice(4);
			if (overId.startsWith('logo:')) return void setOverlay(overId.slice(5), assetId);
			if (overId.startsWith('sec:')) return void addCard(overId.slice(4), assetId);
			// Dropped onto an existing card - treat it as "add to that section".
			const target = placements.find((p) => p.id === overId);
			if (target) void addCard(target.section, assetId);
			return;
		}

		// Reorder. Both ends must be cards in the same section.
		if (activeId === overId) return;
		const moved = placements.find((p) => p.id === activeId);
		if (!moved) return;
		const ids = bySection(moved.section).map((p) => p.id);
		const from = ids.indexOf(activeId);
		const to = ids.indexOf(overId);
		if (from < 0 || to < 0) return;
		void reorder(moved.section, arrayMove(ids, from, to));
	};

	const draggedAsset = dragging?.startsWith('lib:')
		? assets.find((a) => a.id === dragging.slice(4))
		: undefined;

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={collision}
			onDragStart={(e: DragStartEvent) => setDragging(String(e.active.id))}
			onDragCancel={() => setDragging(null)}
			onDragEnd={onDragEnd}
		>
			<div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 260px) 1fr', gap: 'var(--space-4)', alignItems: 'start' }}>
				<Tray assets={assets} />

				<div style={{ display: 'grid', gap: 'var(--space-4)', minWidth: 0 }}>
					<AsyncState loading={loading} error={error} onRetry={reload}>
						<>
							{sections.map(([name, spec]) => (
								<SectionDrop
									key={name}
									name={name}
									spec={spec}
									cards={bySection(name)}
									onAddEmpty={() => void addCard(name, null)}
									onSetOverlay={setOverlay}
									reload={reload}
								/>
							))}
						</>
					</AsyncState>
				</div>
			</div>

			<DragOverlay dropAnimation={null}>
				{draggedAsset ? (
					<img src={draggedAsset.url} alt="" style={{ width: 90, height: 68, objectFit: 'cover', border: '2px solid var(--accent)' }} />
				) : null}
			</DragOverlay>
		</DndContext>
	);
}

/* Prefer whatever the pointer is actually inside - that is what lets a card's
   small logo box win over the section body it sits in. Sortable reordering
   needs a fallback, because the pointer leaves every droppable while a card is
   mid-flight. */
const collision: CollisionDetection = (args) => {
	const hits = pointerWithin(args);
	return hits.length > 0 ? hits : closestCenter(args);
};

// ---- library tray -----------------------------------------------------------

function Tray({ assets }: { assets: Asset[] }) {
	return (
		<div className="card" style={{ position: 'sticky', top: 12 }}>
			<div style={{ padding: '10px var(--space-4)', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--fg-2)' }}>
				Library · drag onto a section
			</div>
			<div style={{ padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: '70vh', overflowY: 'auto' }}>
				{assets.length === 0 && (
					<div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--fg-muted)', padding: 8 }}>
						Nothing uploaded yet — see the Library tab.
					</div>
				)}
				{assets.map((a) => <TrayTile key={a.id} asset={a} />)}
			</div>
		</div>
	);
}

function TrayTile({ asset }: { asset: Asset }) {
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `lib:${asset.id}` });
	return (
		<div
			ref={setNodeRef}
			{...attributes}
			{...listeners}
			title={asset.filename ?? asset.url}
			style={{ cursor: 'grab', opacity: isDragging ? 0.3 : 1, border: '1px solid var(--border)', lineHeight: 0 }}
		>
			<img src={asset.url} alt="" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', background: 'var(--bg-3)', pointerEvents: 'none' }} />
		</div>
	);
}

// ---- a section ---------------------------------------------------------------

function SectionDrop({
	name, spec, cards, onAddEmpty, onSetOverlay, reload,
}: {
	name: string;
	spec: SectionSpec;
	cards: Placement[];
	onAddEmpty: () => void;
	onSetOverlay: (placementId: string, assetId: string | null) => void;
	reload: () => void;
}) {
	const { setNodeRef, isOver } = useDroppable({ id: `sec:${name}` });
	const ids = cards.map((c) => c.id);

	return (
		<Section
			title={spec.label}
			meta={cards.length === 0
				? `empty → the site shows ${spec.placeholderCount} placeholders`
				: `${cards.length} card${cards.length === 1 ? '' : 's'}`}
			action={spec.imageOptional ? (
				<button type="button" className="btn ghost" onClick={onAddEmpty}>
					<Plus size={12} /> Add without photo
				</button>
			) : undefined}
		>
			<div style={{ fontSize: 11, color: 'var(--fg-muted)', marginBottom: 10 }}>{spec.hint}</div>
			<div
				ref={setNodeRef}
				style={{
					display: 'grid', gap: 8, padding: 8, minHeight: 72,
					border: `1px dashed ${isOver ? 'var(--accent)' : 'var(--border)'}`,
					background: isOver ? 'var(--bg-3)' : 'transparent',
				}}
			>
				{cards.length === 0 && (
					<div style={{ display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--fg-muted)', padding: 12 }}>
						Drop an image here. While this stays empty the site renders its own placeholders.
					</div>
				)}
				<SortableContext items={ids} strategy={verticalListSortingStrategy}>
					{cards.map((c) => (
						<Card key={c.id} card={c} spec={spec} onSetOverlay={onSetOverlay} reload={reload} />
					))}
				</SortableContext>
			</div>
		</Section>
	);
}

// ---- one placed card ---------------------------------------------------------

function Card({
	card, spec, onSetOverlay, reload,
}: {
	card: Placement;
	spec: SectionSpec;
	onSetOverlay: (placementId: string, assetId: string | null) => void;
	reload: () => void;
}) {
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id });
	const ask = useConfirm();
	const copy = card as unknown as Record<string, string | null>;

	const saveField = async (field: string, value: string) => {
		if (value === (copy[field] ?? '')) return;
		try {
			await api('PATCH', `${PLACEMENTS_KEY}/${card.id}`, { [field]: value || null });
			reload();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	const remove = async () => {
		if (!(await ask({ message: 'Remove this card from the section? The image stays in the library.', danger: true }))) return;
		try {
			await api('DELETE', `${PLACEMENTS_KEY}/${card.id}`);
			reload();
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	return (
		<div
			ref={setNodeRef}
			style={{
				transform: CSS.Transform.toString(transform),
				transition,
				opacity: isDragging ? 0.4 : 1,
				display: 'flex', gap: 10, alignItems: 'flex-start',
				border: '1px solid var(--border)', background: 'var(--bg-1)', padding: 8,
			}}
		>
			<span {...attributes} {...listeners} style={{ cursor: 'grab', color: 'var(--fg-muted)', paddingTop: 4 }}>
				<GripVertical size={14} />
			</span>

			{card.asset_url ? (
				<img src={card.asset_url} alt="" style={{ width: 96, height: 72, objectFit: 'cover', background: 'var(--bg-3)', flex: 'none' }} />
			) : (
				<div
					style={{ width: 96, height: 72, display: 'grid', placeItems: 'center', background: 'var(--bg-3)', color: 'var(--fg-muted)', flex: 'none' }}
					title="No photo — allowed in this section"
				>
					<ImageOff size={16} />
				</div>
			)}

			<div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 6 }}>
				{spec.fields.map((f) => (
					f.multiline ? (
						<textarea
							key={f.name}
							className="search-input"
							rows={3}
							placeholder={f.label}
							defaultValue={copy[f.name] ?? ''}
							onBlur={(e) => void saveField(f.name, e.target.value)}
							style={{ fontSize: 12, height: 'auto', resize: 'vertical', padding: 6 }}
						/>
					) : (
						<input
							key={f.name}
							className="search-input"
							placeholder={f.label}
							defaultValue={copy[f.name] ?? ''}
							onBlur={(e) => void saveField(f.name, e.target.value)}
							onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
							style={{ fontSize: 12, height: 28 }}
						/>
					)
				))}
			</div>

			{spec.overlay && <LogoSlot card={card} onSetOverlay={onSetOverlay} />}

			<button type="button" className="btn ghost" onClick={() => void remove()} title="Remove from section">
				<Trash2 size={12} />
			</button>
		</div>
	);
}

/** The company logo drawn at the middle bottom of a gallery image. Its own drop
 *  target so a logo can be dragged straight onto the card it belongs to. */
function LogoSlot({
	card, onSetOverlay,
}: {
	card: Placement;
	onSetOverlay: (placementId: string, assetId: string | null) => void;
}) {
	const { setNodeRef, isOver } = useDroppable({ id: `logo:${card.id}` });
	return (
		<div style={{ flex: 'none', display: 'grid', gap: 3, justifyItems: 'center' }}>
			<div
				ref={setNodeRef}
				title="Drop a company logo here"
				style={{
					width: 72, height: 46, display: 'grid', placeItems: 'center',
					border: `1px dashed ${isOver ? 'var(--accent)' : 'var(--border)'}`,
					background: isOver ? 'var(--bg-3)' : 'var(--bg-2)',
					fontSize: 9, color: 'var(--fg-muted)', textAlign: 'center', padding: 2,
				}}
			>
				{card.overlay_url
					? <img src={card.overlay_url} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
					: 'company logo'}
			</div>
			{card.overlay_url && (
				<button
					type="button"
					className="btn ghost"
					style={{ fontSize: 9, padding: '1px 6px' }}
					onClick={() => onSetOverlay(card.id, null)}
				>
					clear
				</button>
			)}
		</div>
	);
}
