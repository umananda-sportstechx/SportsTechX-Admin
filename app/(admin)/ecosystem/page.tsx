'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Save, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState, Loading, StatCard, Section, Pager } from '@/components/atoms';
import { PieDonut, PieLegend, toSegments, type Bucket } from '@/components/charts';
import { FilterBar, FilterSelect, StatStrip } from '@/components/filters';
import { CsvImportButton } from '@/components/csv-import';
import { YearSelect } from '@/components/year-select';
import { ImageInput } from '@/components/image-input';
import { TabbedForm, Field, useTabs } from '@/components/tabbed-form';
import { SportsPicker, LocationFields, SocialLinks, CompanySelectOne, EMPTY_SOCIAL, EMPTY_LOCATION, type SocialValue, type LocationValue } from '@/components/entity-pickers';

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
interface EcoStats { total: number; upcoming_events?: number; added_this_month?: number; added_last_month?: number; by_type: Bucket[]; by_status: Bucket[] }

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
				<StatCard
					label="Added this month"
					loading={stats.isLoading}
					value={(stats.data?.added_this_month ?? 0).toLocaleString()}
					delta={stats.data && (stats.data.added_last_month ?? 0) > 0 ? (((stats.data.added_this_month ?? 0) - (stats.data.added_last_month ?? 0)) / (stats.data.added_last_month ?? 1)) * 100 : null}
				/>
				<StatCard label="Upcoming events" loading={stats.isLoading} value={(stats.data?.upcoming_events ?? 0).toLocaleString()} />
				{(stats.data?.by_type ?? []).slice(0, 1).map((b) => (
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
				<CsvImportButton entity="ecosystem" onDone={() => void refresh()} />
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
			<Pager page={page} totalPages={data?.totalPages} onPage={setPage} />
		</div>
	);
}

interface ProgramDetails {
	duration_label: string; interval_label: string; investment_label: string; equity_label: string;
	stage_label: string; cohort_size: string; latest_cohort_year: string; cohort_history_label: string;
	details: string; entries_open: boolean; entries_end_date: string; is_virtual: boolean; has_office_space: boolean; is_profitable: boolean;
}
interface EventDetails {
	mode: string; start_date: string; end_date: string; is_featured: boolean;
	cover_url: string; discount_code: string; discount_description: string;
}
interface EntityForm {
	name: string; slug: string; entity_type: string; description: string; website: string;
	category: string; founded_year: string; latest_activity_year: string; status: string; hq: LocationValue;
	poc_name: string; poc_position: string; poc_email: string; poc_linkedin: string;
	social: SocialValue; sport_ids: string[]; program: ProgramDetails; event: EventDetails;
}

const EMPTY_PROGRAM: ProgramDetails = {
	duration_label: '', interval_label: '', investment_label: '', equity_label: '', stage_label: '',
	cohort_size: '', latest_cohort_year: '', cohort_history_label: '', details: '',
	entries_open: false, entries_end_date: '', is_virtual: false, has_office_space: false, is_profitable: false,
};
const EMPTY_EVENT: EventDetails = {
	mode: '', start_date: '', end_date: '', is_featured: false, cover_url: '', discount_code: '', discount_description: '',
};
const emptyEntity = (type: string): EntityForm => ({
	name: '', slug: '', entity_type: type, description: '', website: '', category: '', founded_year: '', latest_activity_year: '', status: 'active',
	poc_name: '', poc_position: '', poc_email: '', poc_linkedin: '',
	hq: { ...EMPTY_LOCATION }, social: { ...EMPTY_SOCIAL }, sport_ids: [], program: { ...EMPTY_PROGRAM }, event: { ...EMPTY_EVENT },
});

interface EntityEdit extends Entity {
	description?: string | null; website?: string | null; founded_year?: number | null; latest_activity_year?: number | null;
	poc_name?: string | null; poc_position?: string | null; poc_email?: string | null; poc_linkedin?: string | null;
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
		founded_year: h.founded_year ? String(h.founded_year) : '', latest_activity_year: h.latest_activity_year ? String(h.latest_activity_year) : '', status: h.status ?? 'active',
		poc_name: h.poc_name ?? '', poc_position: h.poc_position ?? '', poc_email: h.poc_email ?? '', poc_linkedin: h.poc_linkedin ?? '',
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
			entries_open: !!p.entries_open, entries_end_date: date(p.entries_end_date), is_virtual: !!p.is_virtual, has_office_space: !!p.has_office_space, is_profitable: !!p.is_profitable,
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
				latest_activity_year: form.latest_activity_year ? Number(form.latest_activity_year) : undefined,
				poc_name: form.poc_name.trim() || undefined,
				poc_position: form.poc_position.trim() || undefined,
				poc_email: form.poc_email.trim() || undefined,
				poc_linkedin: form.poc_linkedin.trim() || undefined,
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
					entries_end_date: form.program.entries_end_date || null,
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
									<Field label="Founded"><YearSelect value={form.founded_year} onChange={(v) => set('founded_year', v)} /></Field>
								</div>
								<Field label="Status">
									<select className="search-input" value={form.status} onChange={(e) => set('status', e.target.value)}>
										{STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
									</select>
								</Field>
							</>
						) },
						{ key: 'contact', label: 'Contact', node: (
							<>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
									<Field label="POC name"><input className="search-input" value={form.poc_name} onChange={(e) => set('poc_name', e.target.value)} /></Field>
									<Field label="POC position"><input className="search-input" value={form.poc_position} onChange={(e) => set('poc_position', e.target.value)} /></Field>
								</div>
								<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
									<Field label="POC email"><input className="search-input" value={form.poc_email} onChange={(e) => set('poc_email', e.target.value)} placeholder="name@org.com" /></Field>
									<Field label="POC LinkedIn"><input className="search-input" value={form.poc_linkedin} onChange={(e) => set('poc_linkedin', e.target.value)} placeholder="https://linkedin.com/in/…" /></Field>
								</div>
								<Field label="Latest activity year" hint="most recent year this entity was active"><YearSelect value={form.latest_activity_year} onChange={(v) => set('latest_activity_year', v)} /></Field>
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
										<Field label="Cover image"><ImageInput value={form.event.cover_url} onChange={(u) => setEvent('cover_url', u)} pathPrefix="ecosystem/events" /></Field>
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
										<Field label="Latest cohort"><YearSelect value={form.program.latest_cohort_year} onChange={(v) => setProgram('latest_cohort_year', v)} /></Field>
									</div>
									<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
										<Field label="Cohort history"><input className="search-input" value={form.program.cohort_history_label} onChange={(e) => setProgram('cohort_history_label', e.target.value)} /></Field>
										<Field label="Applications close"><input className="search-input" type="date" value={form.program.entries_end_date} onChange={(e) => setProgram('entries_end_date', e.target.value)} /></Field>
									</div>
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
						{ key: 'links', label: 'Links & cohort', node: isEdit && id
							? <LinksCohortPanel entityId={id} />
							: <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Save the entity first, then re-open it to link related programs/events and manage cohort participants.</div> },
					]}
				/>
			)}
		</Modal>
	);
}

const REL_TYPES = ['initiative_has_program', 'initiative_has_event', 'program_has_event', 'program_has_initiative', 'program_has_program', 'initiative_has_initiative', 'organization_has_program', 'organization_has_event'] as const;
const PART_STATUS = ['applied', 'accepted', 'graduated', 'dropped'] as const;

interface RelRow { id: string; relationship_type: string; child_id: string; child_name: string; child_type: string }
interface PartRow { id: string; company_id: string | null; name: string | null; cohort_name: string | null; cohort_year: number | null; participation_status: string }
interface EcoHit { id: string; name: string; entity_type: string }

/** Relationship-linking + cohort-participant management for an existing entity. */
function LinksCohortPanel({ entityId }: { entityId: string }) {
	const { mutate } = useSWRConfig();
	const rels = useSWR<RelRow[]>([`/api/admin/ecosystem-entities/${entityId}/relationships`], { dedupingInterval: 10_000 });
	const parts = useSWR<PartRow[]>([`/api/admin/ecosystem-entities/${entityId}/participants`], { dedupingInterval: 10_000 });
	const refreshRels = () => mutate([`/api/admin/ecosystem-entities/${entityId}/relationships`]);
	const refreshParts = () => mutate([`/api/admin/ecosystem-entities/${entityId}/participants`]);

	// relationship add state
	const [relType, setRelType] = useState<string>('program_has_event');
	const [childQ, setChildQ] = useState('');
	const [childId, setChildId] = useState('');
	const childSearch = useSWR<{ data: EcoHit[] }>(childQ.length >= 2 ? ['/api/ecosystem-entities', { q: childQ, limit: 8 }] : null, { dedupingInterval: 10_000, keepPreviousData: true });
	const addRel = async () => {
		if (!childId) { toast.error('Pick an entity to link.'); return; }
		try { await api('POST', `/api/admin/ecosystem-entities/${entityId}/relationships`, { child_id: childId, relationship_type: relType }); toast.success('Linked'); setChildId(''); setChildQ(''); void refreshRels(); }
		catch (e) { toast.error((e as Error).message); }
	};
	const delRel = async (relId: string) => { try { await api('DELETE', `/api/admin/ecosystem-entities/${entityId}/relationships/${relId}`); void refreshRels(); } catch (e) { toast.error((e as Error).message); } };

	// participant add state — prefer linking a real company; fall back to a free-text name.
	const [pCompanyId, setPCompanyId] = useState('');
	const [pName, setPName] = useState('');
	const [pCohort, setPCohort] = useState('');
	const [pYear, setPYear] = useState('');
	const [pStatus, setPStatus] = useState<string>('accepted');
	const addPart = async () => {
		if (!pCompanyId && !pName.trim()) { toast.error('Pick a company or enter a startup name.'); return; }
		try {
			await api('POST', `/api/admin/ecosystem-entities/${entityId}/participants`, {
				company_id: pCompanyId || undefined,
				startup_name: !pCompanyId && pName.trim() ? pName.trim() : undefined,
				cohort_name: pCohort.trim() || undefined, cohort_year: pYear ? Number(pYear) : undefined, status: pStatus,
			});
			toast.success('Participant added'); setPCompanyId(''); setPName(''); setPCohort(''); setPYear(''); void refreshParts();
		} catch (e) { toast.error((e as Error).message); }
	};
	const delPart = async (ppId: string) => { try { await api('DELETE', `/api/admin/ecosystem-entities/${entityId}/participants/${ppId}`); void refreshParts(); } catch (e) { toast.error((e as Error).message); } };
	const delCohort = async (year: number) => {
		if (!confirm(`Delete all participants in the ${year} cohort?`)) return;
		try { await api('DELETE', `/api/admin/ecosystem-entities/${entityId}/cohorts/${year}`); toast.success(`${year} cohort cleared`); void refreshParts(); }
		catch (e) { toast.error((e as Error).message); }
	};
	// Group participants by cohort year (newest first; null years last).
	const grouped = (() => {
		const m = new Map<number | null, PartRow[]>();
		for (const p of parts.data ?? []) { const y = p.cohort_year ?? null; if (!m.has(y)) m.set(y, []); m.get(y)!.push(p); }
		return [...m.entries()].sort((a, b) => (b[0] ?? -1) - (a[0] ?? -1));
	})();

	return (
		<div style={{ display: 'grid', gap: 18 }}>
			<div>
				<div className="co-stat-label" style={{ marginBottom: 8 }}>Related entities</div>
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 10 }}>
					<select className="search-input" style={{ height: 32, flex: '0 0 auto' }} value={relType} onChange={(e) => setRelType(e.target.value)}>
						{REL_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
					</select>
					<div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
						<input className="search-input" style={{ width: '100%', height: 32 }} placeholder="Search entity to link…" value={childId ? '' : childQ} onChange={(e) => { setChildQ(e.target.value); setChildId(''); }} />
						{childId === '' && childQ.length >= 2 && (childSearch.data?.data?.length ?? 0) > 0 && (
							<div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: 'var(--bg-1)', border: '1px solid var(--border)', maxHeight: 180, overflow: 'auto' }}>
								{(childSearch.data?.data ?? []).filter((h) => h.id !== entityId).map((h) => (
									<button key={h.id} type="button" onClick={() => { setChildId(h.id); setChildQ(h.name); }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--fg)', fontSize: 13 }}>{h.name} <span style={{ color: 'var(--fg-muted)' }}>· {h.entity_type}</span></button>
								))}
							</div>
						)}
						{childId && <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>selected: {childQ}</div>}
					</div>
					<button className="btn" style={{ height: 32 }} onClick={() => void addRel()}>Link</button>
				</div>
				<AsyncState loading={rels.isLoading} error={rels.error} empty={(rels.data?.length ?? 0) === 0} emptyMsg="No linked entities." onRetry={() => void refreshRels()}>
					<table className="data-table"><tbody>
						{(rels.data ?? []).map((r) => (
							<tr key={r.id}><td>{r.child_name} <span style={{ color: 'var(--fg-muted)', fontSize: 11 }}>· {r.child_type}</span></td><td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)' }}>{r.relationship_type.replace(/_/g, ' ')}</td><td style={{ textAlign: 'right' }}><button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void delRel(r.id)}><Trash2 size={12} /></button></td></tr>
						))}
					</tbody></table>
				</AsyncState>
			</div>

			<div>
				<div className="co-stat-label" style={{ marginBottom: 8 }}>Cohort participants</div>
				<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 4 }}>
					<div style={{ flex: '1 1 200px' }}><CompanySelectOne value={pCompanyId} onChange={setPCompanyId} /></div>
					<input className="search-input" style={{ height: 32, flex: '0 0 110px' }} placeholder="Cohort" value={pCohort} onChange={(e) => setPCohort(e.target.value)} />
					<div style={{ flex: '0 0 100px' }}><YearSelect value={pYear} onChange={setPYear} placeholder="Year" /></div>
					<select className="search-input" style={{ height: 32, flex: '0 0 auto' }} value={pStatus} onChange={(e) => setPStatus(e.target.value)}>{PART_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}</select>
					<button className="btn" style={{ height: 32 }} onClick={() => void addPart()}>Add</button>
				</div>
				{!pCompanyId && (
					<input className="search-input" style={{ height: 30, marginBottom: 10, width: '100%' }} placeholder="…or a startup name not yet in the database" value={pName} onChange={(e) => setPName(e.target.value)} />
				)}
				<AsyncState loading={parts.isLoading} error={parts.error} empty={(parts.data?.length ?? 0) === 0} emptyMsg="No participants." onRetry={() => void refreshParts()}>
					<div style={{ display: 'grid', gap: 12 }}>
						{grouped.map(([year, rows]) => (
							<div key={year ?? 'none'}>
								<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
									<div style={{ fontSize: 12, fontWeight: 600 }}>{year ?? 'No year'} <span style={{ color: 'var(--fg-muted)', fontWeight: 400 }}>· {rows.length}</span></div>
									{year != null && <button className="btn ghost" style={{ color: 'var(--accent)', fontSize: 11, padding: '2px 8px' }} onClick={() => void delCohort(year)}>Delete cohort</button>}
								</div>
								<table className="data-table"><tbody>
									{rows.map((pp) => (
										<tr key={pp.id}><td>{pp.name ?? '—'}{pp.company_id && <span className="tag pos" style={{ marginLeft: 6 }}>linked</span>}</td><td>{pp.cohort_name ?? '—'}</td><td>{pp.participation_status}</td><td style={{ textAlign: 'right' }}><button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void delPart(pp.id)}><Trash2 size={12} /></button></td></tr>
									))}
								</tbody></table>
							</div>
						))}
					</div>
				</AsyncState>
			</div>
		</div>
	);
}
