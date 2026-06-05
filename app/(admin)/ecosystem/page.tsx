'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState, Loading, StatCard, Section } from '@/components/atoms';
import { PieDonut, PieLegend, toSegments, type Bucket } from '@/components/charts';
import { FilterBar, FilterSelect, StatStrip } from '@/components/filters';
import { TabbedForm, Field, useTabs } from '@/components/tabbed-form';
import { SportsPicker, LocationFields, SocialLinks, EMPTY_SOCIAL, EMPTY_LOCATION, type SocialValue, type LocationValue } from '@/components/entity-pickers';

interface Entity {
	id: string;
	name: string;
	slug?: string;
	entity_type: string;
	category?: string | null;
	status?: string | null;
	hq_country?: string | null;
}
interface Response { data: Entity[]; total: number; totalPages: number }
interface EcoStats { total: number; by_type: Bucket[]; by_status: Bucket[] }

const STATUSES = ['active', 'inactive', 'paused'] as const;
const ENTITY_TYPES = ['program', 'event', 'organization', 'initiative'] as const;
const EVENT_MODES = ['in_person', 'virtual', 'hybrid'] as const;

export default function EcosystemAdminPage() {
	const { mutate } = useSWRConfig();
	const [type, setType] = useState<'program' | 'event'>('program');
	const [search, setSearch] = useState('');
	const [status, setStatus] = useState('');
	const [page, setPage] = useState(1);
	const [creating, setCreating] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [removePending, setRemovePending] = useState(false);

	const { data, error, isLoading } = useSWR<Response>(
		['/api/ecosystem-entities', { entity_type: type, q: search || undefined, status: status || undefined, page, limit: 30 }],
		{ dedupingInterval: 30_000 },
	);
	const stats = useSWR<EcoStats>(['/api/admin/stats/ecosystem'], { dedupingInterval: 60_000 });
	const typeSegments = toSegments(stats.data?.by_type ?? []);
	const statusSegments = toSegments(stats.data?.by_status ?? []);

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/ecosystem-entities');

	const remove = async (id: string, name: string) => {
		if (!confirm(`Delete ${name}?`)) return;
		setRemovePending(true);
		try {
			await api('DELETE', `/api/admin/ecosystem-entities/${id}`);
			toast.success('Deleted');
			void refresh();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setRemovePending(false);
		}
	};

	const entities = data?.data ?? [];
	return (
		<div>
			<PageHeader kicker={`Ecosystem · ${(stats.data?.total ?? 0).toLocaleString()} entities`} title="Programs & events" />

			<StatStrip cols={4}>
				<StatCard label="Total entities" loading={stats.isLoading} value={(stats.data?.total ?? 0).toLocaleString()} />
				{(stats.data?.by_type ?? []).slice(0, 3).map((b) => (
					<StatCard key={b.label} label={b.label} loading={stats.isLoading} value={b.value.toLocaleString()} />
				))}
			</StatStrip>

			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
				<Section title="By type" meta="entities">
					<AsyncState loading={stats.isLoading} error={stats.error} empty={typeSegments.length === 0} emptyMsg="No data" onRetry={() => void stats.mutate()}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
							<PieDonut segments={typeSegments} size={170} mode="donut" />
							<div style={{ flex: 1, minWidth: 160 }}><PieLegend segments={typeSegments} /></div>
						</div>
					</AsyncState>
				</Section>
				<Section title="By status" meta="entities">
					<AsyncState loading={stats.isLoading} error={stats.error} empty={statusSegments.length === 0} emptyMsg="No data" onRetry={() => void stats.mutate()}>
						<PieDonut segments={statusSegments} mode="bar" />
					</AsyncState>
				</Section>
			</div>

			<FilterBar>
				<button className={`chip ${type === 'program' ? 'on' : ''}`} onClick={() => { setType('program'); setPage(1); }}>Programs</button>
				<button className={`chip ${type === 'event' ? 'on' : ''}`} onClick={() => { setType('event'); setPage(1); }}>Events</button>
				<input className="search-input" style={{ flex: '0 0 240px', height: 32 }} placeholder="Search…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
				<FilterSelect ariaLabel="Status" value={status} onChange={(v) => { setStatus(v); setPage(1); }} options={[...STATUSES]} allLabel="All statuses" />
				<div style={{ flex: 1 }} />
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> Add {type}</button>
			</FilterBar>

			{(creating || editingId) && (
				<EntityModal
					id={editingId}
					defaultType={type}
					onClose={() => { setCreating(false); setEditingId(null); }}
					onSaved={() => { setCreating(false); setEditingId(null); void refresh(); }}
				/>
			)}

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={entities.length === 0} emptyMsg={`No ${type}s yet.`} onRetry={() => void refresh()}>
					<table className="data-table">
						<thead><tr><th>Name</th><th>Slug</th><th>Category</th><th>Status</th><th>HQ</th><th style={{ textAlign: 'right' }} /></tr></thead>
						<tbody>
							{entities.map((e) => (
								<tr key={e.id}>
									<td>{e.name}</td>
									<td className="num">{e.slug ?? '—'}</td>
									<td>{e.category ?? '—'}</td>
									<td>{e.status ?? '—'}</td>
									<td>{e.hq_country ?? '—'}</td>
									<td style={{ textAlign: 'right', display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
										<button className="btn ghost" onClick={() => setEditingId(e.id)}>Edit</button>
										<button className="btn ghost" style={{ color: 'var(--accent)' }} disabled={removePending} onClick={() => void remove(e.id, e.name)}>
											<Trash2 size={12} />
										</button>
								</td>
							</tr>
						))}
					</tbody>
					</table>
				</AsyncState>
			</div>
		</div>
	);
}

interface ProgramDetails {
	duration_label: string; interval_label: string; investment_label: string; equity_label: string;
	stage_label: string; cohort_size: string; latest_cohort_year: string; cohort_history_label: string;
	details: string; entries_open: boolean; is_virtual: boolean; has_office_space: boolean; is_profitable: boolean;
}
interface EventDetails {
	mode: string; start_date: string; end_date: string; is_featured: boolean;
	cover_url: string; discount_code: string; discount_description: string;
}
interface EntityForm {
	name: string; slug: string; entity_type: string; description: string; website: string;
	category: string; founded_year: string; status: string; hq: LocationValue;
	social: SocialValue; sport_ids: string[]; program: ProgramDetails; event: EventDetails;
}

const EMPTY_PROGRAM: ProgramDetails = {
	duration_label: '', interval_label: '', investment_label: '', equity_label: '', stage_label: '',
	cohort_size: '', latest_cohort_year: '', cohort_history_label: '', details: '',
	entries_open: false, is_virtual: false, has_office_space: false, is_profitable: false,
};
const EMPTY_EVENT: EventDetails = {
	mode: '', start_date: '', end_date: '', is_featured: false, cover_url: '', discount_code: '', discount_description: '',
};
const emptyEntity = (type: string): EntityForm => ({
	name: '', slug: '', entity_type: type, description: '', website: '', category: '', founded_year: '', status: 'active',
	hq: { ...EMPTY_LOCATION }, social: { ...EMPTY_SOCIAL }, sport_ids: [], program: { ...EMPTY_PROGRAM }, event: { ...EMPTY_EVENT },
});

interface EntityEdit extends Entity {
	description?: string | null; website?: string | null; founded_year?: number | null;
	hq_city?: string | null; hq_continent?: string | null; hq_region?: string | null; hq_state?: string | null;
	twitter_url?: string | null; instagram_url?: string | null; facebook_url?: string | null;
	linkedin_url?: string | null; youtube_url?: string | null; email?: string | null;
	sport_ids?: string[];
	program?: Record<string, unknown> | null;
	event?: Record<string, unknown> | null;
}

function toEntityForm(h: EntityEdit, defaultType: string): EntityForm {
	const p = (h.program ?? {}) as Record<string, unknown>;
	const ev = (h.event ?? {}) as Record<string, unknown>;
	const str = (v: unknown) => (v == null ? '' : String(v));
	const date = (v: unknown) => (v == null ? '' : String(v).slice(0, 10));
	return {
		name: h.name ?? '', slug: h.slug ?? '', entity_type: h.entity_type ?? defaultType,
		description: h.description ?? '', website: h.website ?? '', category: h.category ?? '',
		founded_year: h.founded_year ? String(h.founded_year) : '', status: h.status ?? 'active',
		hq: { country: h.hq_country ?? '', city: h.hq_city ?? '', continent: h.hq_continent ?? '', region: h.hq_region ?? '', state: h.hq_state ?? '' },
		social: {
			twitter_url: h.twitter_url ?? '', instagram_url: h.instagram_url ?? '', facebook_url: h.facebook_url ?? '',
			linkedin_url: h.linkedin_url ?? '', youtube_url: h.youtube_url ?? '', email: h.email ?? '',
		},
		sport_ids: h.sport_ids ?? [],
		program: {
			duration_label: str(p.duration_label), interval_label: str(p.interval_label), investment_label: str(p.investment_label),
			equity_label: str(p.equity_label), stage_label: str(p.stage_label), cohort_size: str(p.cohort_size),
			latest_cohort_year: str(p.latest_cohort_year), cohort_history_label: str(p.cohort_history_label), details: str(p.details),
			entries_open: !!p.entries_open, is_virtual: !!p.is_virtual, has_office_space: !!p.has_office_space, is_profitable: !!p.is_profitable,
		},
		event: {
			mode: str(ev.mode), start_date: date(ev.start_date), end_date: date(ev.end_date),
			is_featured: !!ev.is_featured, cover_url: str(ev.cover_url), discount_code: str(ev.discount_code), discount_description: str(ev.discount_description),
		},
	};
}

function EntityModal({ id, defaultType, onClose, onSaved }: { id: string | null; defaultType: string; onClose: () => void; onSaved: () => void }) {
	const isEdit = !!id;
	const { data: hydrated } = useSWR<EntityEdit>(isEdit ? [`/api/admin/ecosystem-entities/${id}/edit`] : null, { revalidateOnFocus: false });
	if (isEdit && !hydrated) return <Modal title="Edit entity" onClose={onClose}><Loading msg="Loading entity…" /></Modal>;
	return <EntityForm id={id} initial={hydrated ? toEntityForm(hydrated, defaultType) : emptyEntity(defaultType)} onClose={onClose} onSaved={onSaved} />;
}

function EntityForm({ id, initial, onClose, onSaved }: { id: string | null; initial: EntityForm; onClose: () => void; onSaved: () => void }) {
	const isEdit = !!id;
	const [tab, setTab] = useTabs('profile');
	const [form, setForm] = useState<EntityForm>(initial);
	const [pending, setPending] = useState(false);

	const set = <K extends keyof EntityForm>(k: K, v: EntityForm[K]) => setForm((f) => ({ ...f, [k]: v }));
	const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

	const submit = async () => {
		setPending(true);
		try {
			const body: Record<string, unknown> = {
				name: form.name.trim(),
				slug: form.slug.trim() || undefined,
				entity_type: form.entity_type,
				description: form.description.trim() || undefined,
				website: form.website.trim() || undefined,
				category: form.category.trim() || undefined,
				founded_year: form.founded_year ? Number(form.founded_year) : undefined,
				status: form.status,
				hq_country: form.hq.country.trim() || undefined,
				hq_city: form.hq.city.trim() || undefined,
				hq_continent: form.hq.continent.trim() || undefined,
				hq_region: form.hq.region.trim() || undefined,
				hq_state: form.hq.state.trim() || undefined,
				social: form.social,
				sport_ids: form.sport_ids,
			};
			if (form.entity_type === 'program' || form.entity_type === 'initiative' || form.entity_type === 'organization') {
				body.program = {
					duration_label: form.program.duration_label.trim() || null,
					interval_label: form.program.interval_label.trim() || null,
					investment_label: form.program.investment_label.trim() || null,
					equity_label: form.program.equity_label.trim() || null,
					stage_label: form.program.stage_label.trim() || null,
					cohort_size: numOrNull(form.program.cohort_size),
					latest_cohort_year: numOrNull(form.program.latest_cohort_year),
					cohort_history_label: form.program.cohort_history_label.trim() || null,
					details: form.program.details.trim() || null,
					entries_open: form.program.entries_open,
					is_virtual: form.program.is_virtual,
					has_office_space: form.program.has_office_space,
					is_profitable: form.program.is_profitable,
				};
			}
			if (form.entity_type === 'event') {
				body.event = {
					mode: form.event.mode || null,
					start_date: form.event.start_date || null,
					end_date: form.event.end_date || null,
					is_featured: form.event.is_featured,
					cover_url: form.event.cover_url.trim() || null,
					discount_code: form.event.discount_code.trim() || null,
					discount_description: form.event.discount_description.trim() || null,
				};
			}
			if (isEdit) await api('PATCH', `/api/admin/ecosystem-entities/${id}`, body);
			else await api('POST', '/api/admin/ecosystem-entities', body);
			toast.success(isEdit ? 'Saved' : 'Created');
			onSaved();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setPending(false);
		}
	};

	const isEvent = form.entity_type === 'event';
	const setProgram = <K extends keyof ProgramDetails>(k: K, v: ProgramDetails[K]) => set('program', { ...form.program, [k]: v });
	const setEvent = <K extends keyof EventDetails>(k: K, v: EventDetails[K]) => set('event', { ...form.event, [k]: v });

	return (
		<Modal
			title={isEdit ? 'Edit entity' : 'New entity'}
			onClose={onClose}
			width={680}
			footer={
				<>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={!form.name.trim() || pending} onClick={() => void submit()}>
						<Save size={12} /> {pending ? 'Saving…' : 'Save'}
					</button>
				</>
			}
		>
			{(
				<TabbedForm
					active={tab}
					onChange={setTab}
					tabs={[
						{ key: 'profile', label: 'Profile', node: (
							<>
								<Field label="Name"><input className="search-input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
								<Field label="Type">
									<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
										{ENTITY_TYPES.map((t) => (
											<button key={t} type="button" className={`chip ${form.entity_type === t ? 'on' : ''}`} onClick={() => set('entity_type', t)}>{t}</button>
										))}
									</div>
								</Field>
								<Field label={isEdit ? 'Slug' : 'Slug (optional — auto from name)'}><input className="search-input" style={{ fontFamily: 'var(--font-mono)' }} value={form.slug} onChange={(e) => set('slug', e.target.value)} disabled={isEdit} /></Field>
								<Field label="Description"><textarea className="search-input" style={{ minHeight: 70, resize: 'vertical' }} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 12 }}>
									<Field label="Website"><input className="search-input" type="url" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://" /></Field>
									<Field label="Category"><input className="search-input" value={form.category} onChange={(e) => set('category', e.target.value)} placeholder="Incubator, VC…" /></Field>
									<Field label="Founded"><input className="search-input" type="number" value={form.founded_year} onChange={(e) => set('founded_year', e.target.value)} /></Field>
								</div>
								<Field label="Status">
									<select className="search-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
										{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
									</select>
								</Field>
							</>
						) },
						{ key: 'location', label: 'Location', node: <Field label="Headquarters"><LocationFields value={form.hq} onChange={(v) => set('hq', v)} /></Field> },
						{
							key: 'details', label: isEvent ? 'Event details' : 'Program details', node: isEvent ? (
								<>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
										<Field label="Mode">
											<select className="search-input" value={form.event.mode} onChange={(e) => setEvent('mode', e.target.value)}>
												<option value="">—</option>
												{EVENT_MODES.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
											</select>
										</Field>
										<Field label="Cover image URL"><input className="search-input" value={form.event.cover_url} onChange={(e) => setEvent('cover_url', e.target.value)} placeholder="https://" /></Field>
									</div>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
										<Field label="Start date"><input className="search-input" type="date" value={form.event.start_date} onChange={(e) => setEvent('start_date', e.target.value)} /></Field>
										<Field label="End date"><input className="search-input" type="date" value={form.event.end_date} onChange={(e) => setEvent('end_date', e.target.value)} /></Field>
									</div>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
										<Field label="Discount code"><input className="search-input" value={form.event.discount_code} onChange={(e) => setEvent('discount_code', e.target.value)} /></Field>
										<Field label="Discount description"><input className="search-input" value={form.event.discount_description} onChange={(e) => setEvent('discount_description', e.target.value)} /></Field>
									</div>
									<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
										<input type="checkbox" checked={form.event.is_featured} onChange={(e) => setEvent('is_featured', e.target.checked)} /> Featured event
									</label>
								</>
							) : (
								<>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
										<Field label="Duration"><input className="search-input" value={form.program.duration_label} onChange={(e) => setProgram('duration_label', e.target.value)} placeholder="12 weeks" /></Field>
										<Field label="Interval"><input className="search-input" value={form.program.interval_label} onChange={(e) => setProgram('interval_label', e.target.value)} placeholder="Annual" /></Field>
									</div>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
										<Field label="Investment"><input className="search-input" value={form.program.investment_label} onChange={(e) => setProgram('investment_label', e.target.value)} placeholder="$120k" /></Field>
										<Field label="Equity"><input className="search-input" value={form.program.equity_label} onChange={(e) => setProgram('equity_label', e.target.value)} placeholder="6%" /></Field>
									</div>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: 12 }}>
										<Field label="Stage"><input className="search-input" value={form.program.stage_label} onChange={(e) => setProgram('stage_label', e.target.value)} placeholder="Pre-seed" /></Field>
										<Field label="Cohort size"><input className="search-input" type="number" value={form.program.cohort_size} onChange={(e) => setProgram('cohort_size', e.target.value)} /></Field>
										<Field label="Latest cohort"><input className="search-input" type="number" value={form.program.latest_cohort_year} onChange={(e) => setProgram('latest_cohort_year', e.target.value)} /></Field>
									</div>
									<Field label="Cohort history"><input className="search-input" value={form.program.cohort_history_label} onChange={(e) => setProgram('cohort_history_label', e.target.value)} /></Field>
									<Field label="Details"><textarea className="search-input" style={{ minHeight: 60, resize: 'vertical' }} value={form.program.details} onChange={(e) => setProgram('details', e.target.value)} /></Field>
									<div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
										<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={form.program.entries_open} onChange={(e) => setProgram('entries_open', e.target.checked)} /> Entries open</label>
										<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={form.program.is_virtual} onChange={(e) => setProgram('is_virtual', e.target.checked)} /> Virtual</label>
										<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={form.program.has_office_space} onChange={(e) => setProgram('has_office_space', e.target.checked)} /> Office space</label>
										<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={form.program.is_profitable} onChange={(e) => setProgram('is_profitable', e.target.checked)} /> Profitable</label>
									</div>
								</>
							),
						},
						{ key: 'social', label: 'Social', node: <SocialLinks value={form.social} onChange={(v) => set('social', v)} /> },
						{ key: 'sports', label: 'Sports', hint: form.sport_ids.length, node: <Field label="Sports"><SportsPicker value={form.sport_ids} onChange={(v) => set('sport_ids', v)} /></Field> },
					]}
				/>
			)}
		</Modal>
	);
}
