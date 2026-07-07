'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader, Section, PillTabs, AsyncState } from '@/components/atoms';
import { useConfirm } from '@/components/confirm';

/**
 * Weekly Touchpoints — a single shared sales-outreach board. Product → Channel
 * (weekly target) → Person → daily count. Monday-start week, Mon–Fri display.
 * Aggregation is client-side; edits hit /api/admin/touchpoints/* then revalidate.
 */

interface Product { id: string; name: string; sort_order: number }
interface Channel { id: string; product_id: string; name: string; weekly_target: number }
interface Person { id: string; channel_id: string; name: string; email: string | null }
interface Tp { person_id: string; touchpoint_date: string; count: number }
interface Board { products: Product[]; channels: Channel[]; persons: Person[]; touchpoints: Tp[] }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const;

function mondayOf(d: Date): Date {
	const day = d.getDay();
	const diff = day === 0 ? -6 : 1 - day;
	const m = new Date(d);
	m.setDate(d.getDate() + diff);
	m.setHours(0, 0, 0, 0);
	return m;
}
function toIso(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(d.getDate() + n); return x; }
function pct(actual: number, target: number): number { return target > 0 ? Math.round((actual / target) * 100) : 0; }
function pctColor(p: number): string { return p >= 100 ? 'var(--pos)' : p >= 60 ? 'var(--warn)' : 'var(--neg)'; }

export default function TouchpointsPage() {
	const [tab, setTab] = useState<'Weekly log' | 'Team view'>('Weekly log');
	const [anchor, setAnchor] = useState(() => mondayOf(new Date()));
	const monday = toIso(anchor);
	const weekDates = useMemo(() => DAYS.map((_, i) => toIso(addDays(anchor, i))), [anchor]);

	const { data, isLoading, error, mutate } = useSWR<Board>(
		['/api/admin/touchpoints/board', { monday }],
		{ dedupingInterval: 5_000 },
	);
	const confirm = useConfirm();

	const products = data?.products ?? [];
	const channels = data?.channels ?? [];
	const persons = data?.persons ?? [];
	const tps = data?.touchpoints ?? [];

	// ── aggregation helpers (client-side, over the loaded week) ──────────────
	const channelsOf = (pid: string) => channels.filter((c) => c.product_id === pid);
	const personsOf = (cid: string) => persons.filter((p) => p.channel_id === cid);
	const countFor = (personId: string, dayIso: string) =>
		tps.find((t) => t.person_id === personId && t.touchpoint_date === dayIso)?.count ?? 0;
	const personActual = (personId: string) => weekDates.reduce((s, d) => s + countFor(personId, d), 0);
	const channelDayTotal = (cid: string, dayIso: string) =>
		personsOf(cid).reduce((s, p) => s + countFor(p.id, dayIso), 0);
	const channelActual = (cid: string) => weekDates.reduce((s, d) => s + channelDayTotal(cid, d), 0);
	const productDayTotal = (pid: string, dayIso: string) =>
		channelsOf(pid).reduce((s, c) => s + channelDayTotal(c.id, dayIso), 0);
	const productActual = (pid: string) => weekDates.reduce((s, d) => s + productDayTotal(pid, d), 0);
	const productTarget = (pid: string) => channelsOf(pid).reduce((s, c) => s + Number(c.weekly_target), 0);

	async function act(fn: () => Promise<unknown>, err = 'Update failed') {
		try { await fn(); await mutate(); } catch (e) { toast.error((e as Error).message || err); }
	}

	const weekLabel = `${anchor.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${addDays(anchor, 6).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

	return (
		<div>
			<PageHeader
				kicker="Sales"
				title="Weekly touchpoints"
				subtitle="Shared outreach board — log daily touchpoints per person and track weekly progress against per-channel targets."
			/>

			<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
				<PillTabs tabs={['Weekly log', 'Team view'] as const} value={tab} onChange={setTab} />
				<div style={{ flex: 1 }} />
				<button className="btn ghost" onClick={() => setAnchor(addDays(anchor, -7))}>← Prev</button>
				<span style={{ fontWeight: 600, fontSize: 13, minWidth: 170, textAlign: 'center' }}>{weekLabel}</span>
				<button className="btn ghost" onClick={() => setAnchor(addDays(anchor, 7))}>Next →</button>
				<button className="btn ghost" onClick={() => setAnchor(mondayOf(new Date()))}>This week</button>
			</div>

			<AsyncState loading={isLoading} error={error} empty={!isLoading && products.length === 0} emptyMsg="No products yet — add one to start logging.">
				{tab === 'Weekly log' ? (
					<Section
						title="Log"
						meta={`week of ${monday}`}
						action={<AddButton label="Add product" onAdd={(name) => act(() => api('POST', '/api/admin/touchpoints/products', { name }))} placeholder="Product name" />}
					>
						<div className="table-scroll">
							<table className="data-table">
								<thead>
									<tr>
										<th style={{ minWidth: 240 }}>Product · Channel · Person</th>
										<th style={{ textAlign: 'right' }}>Target</th>
										{DAYS.map((d) => <th key={d} style={{ textAlign: 'center', width: 56 }}>{d}</th>)}
										<th style={{ textAlign: 'right' }}>Actual</th>
										<th style={{ textAlign: 'right' }}>vs target</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{products.map((prod) => (
										<ProductBlock
											key={prod.id}
											prod={prod}
											channelsOf={channelsOf}
											personsOf={personsOf}
											weekDates={weekDates}
											countFor={countFor}
											personActual={personActual}
											channelDayTotal={channelDayTotal}
											channelActual={channelActual}
											productDayTotal={productDayTotal}
											productActual={productActual}
											productTarget={productTarget}
											act={act}
											confirm={confirm}
										/>
									))}
								</tbody>
							</table>
						</div>
						<p style={{ fontSize: 11.5, color: 'var(--fg-muted)', marginTop: 12 }}>
							Click a day cell on a <strong>person</strong> row to log their count. Channel &amp; product rows show cumulated totals.
						</p>
					</Section>
				) : (
					<TeamView products={products} channels={channels} persons={persons} channelActual={channelActual} personActual={personActual} personsOf={personsOf} channelsOf={channelsOf} />
				)}
			</AsyncState>
		</div>
	);
}

// ── Product → Channel → Person rows ─────────────────────────────────────────
function ProductBlock(props: {
	prod: Product;
	channelsOf: (pid: string) => Channel[];
	personsOf: (cid: string) => Person[];
	weekDates: string[];
	countFor: (pid: string, d: string) => number;
	personActual: (pid: string) => number;
	channelDayTotal: (cid: string, d: string) => number;
	channelActual: (cid: string) => number;
	productDayTotal: (pid: string, d: string) => number;
	productActual: (pid: string) => number;
	productTarget: (pid: string) => number;
	act: (fn: () => Promise<unknown>, err?: string) => Promise<void>;
	confirm: (opts: { title?: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
}) {
	const { prod, channelsOf, personsOf, weekDates, countFor, personActual, channelDayTotal, channelActual, productDayTotal, productActual, productTarget, act, confirm } = props;
	const [open, setOpen] = useState(true);
	const target = productTarget(prod.id);
	const actual = productActual(prod.id);
	const p = pct(actual, target);

	return (
		<>
			<tr style={{ background: 'var(--bg-2)' }}>
				<td>
					<button onClick={() => setOpen((o) => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'none', border: 0, cursor: 'pointer', font: 'inherit', fontWeight: 700 }}>
						<ChevronRight size={14} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
						<EditableText value={prod.name} onSave={(name) => act(() => api('PATCH', `/api/admin/touchpoints/products/${prod.id}`, { name }))} bold />
					</button>
				</td>
				<td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{target}</td>
				{weekDates.map((d) => <td key={d} className="num" style={{ textAlign: 'center', color: 'var(--fg-muted)' }}>{productDayTotal(prod.id, d) || ''}</td>)}
				<td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{actual}</td>
				<td className="num" style={{ textAlign: 'right', fontWeight: 700, color: pctColor(p) }}>{target > 0 ? `${p}%` : '—'}</td>
				<td style={{ textAlign: 'right' }}>
					<IconDelete onClick={async () => { if (await confirm({ title: `Delete "${prod.name}"?`, message: 'Its channels and persons are deactivated too.', danger: true, confirmLabel: 'Delete' })) act(() => api('DELETE', `/api/admin/touchpoints/products/${prod.id}`)); }} />
				</td>
			</tr>

			{open && channelsOf(prod.id).map((ch) => {
				const cActual = channelActual(ch.id);
				const cp = pct(cActual, ch.weekly_target);
				return (
					<ChannelBlock
						key={ch.id}
						ch={ch}
						persons={personsOf(ch.id)}
						weekDates={weekDates}
						countFor={countFor}
						personActual={personActual}
						channelDayTotal={channelDayTotal}
						cActual={cActual}
						cp={cp}
						act={act}
						confirm={confirm}
					/>
				);
			})}
			{open && (
				<tr>
					<td colSpan={DAYS.length + 4} style={{ paddingLeft: 34 }}>
						<AddButton label="Add channel" placeholder="Channel name" extra="Weekly target" onAdd={(name, extra) => act(() => api('POST', '/api/admin/touchpoints/channels', { product_id: prod.id, name, weekly_target: Number(extra) || 0 }))} small />
					</td>
				</tr>
			)}
		</>
	);
}

function ChannelBlock(props: {
	ch: Channel;
	persons: Person[];
	weekDates: string[];
	countFor: (pid: string, d: string) => number;
	personActual: (pid: string) => number;
	channelDayTotal: (cid: string, d: string) => number;
	cActual: number;
	cp: number;
	act: (fn: () => Promise<unknown>, err?: string) => Promise<void>;
	confirm: (opts: { title?: string; message: string; confirmLabel?: string; danger?: boolean }) => Promise<boolean>;
}) {
	const { ch, persons, weekDates, countFor, personActual, channelDayTotal, cActual, cp, act, confirm } = props;
	return (
		<>
			<tr>
				<td style={{ paddingLeft: 34 }}>
					<EditableText value={ch.name} onSave={(name) => act(() => api('PATCH', `/api/admin/touchpoints/channels/${ch.id}`, { name }))} />
				</td>
				<td style={{ textAlign: 'right' }}>
					<EditableNumber value={ch.weekly_target} onSave={(weekly_target) => act(() => api('PATCH', `/api/admin/touchpoints/channels/${ch.id}`, { weekly_target }))} />
				</td>
				{weekDates.map((d) => <td key={d} className="num" style={{ textAlign: 'center', color: 'var(--fg-muted)' }}>{channelDayTotal(ch.id, d) || ''}</td>)}
				<td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{cActual}</td>
				<td className="num" style={{ textAlign: 'right', fontWeight: 700, color: pctColor(cp) }}>{ch.weekly_target > 0 ? `${cp}%` : '—'}</td>
				<td style={{ textAlign: 'right' }}>
					<IconDelete onClick={async () => { if (await confirm({ title: `Delete channel "${ch.name}"?`, message: 'The channel and its persons are deactivated.', danger: true, confirmLabel: 'Delete' })) act(() => api('DELETE', `/api/admin/touchpoints/channels/${ch.id}`)); }} />
				</td>
			</tr>
			{persons.map((pr) => (
				<tr key={pr.id}>
					<td style={{ paddingLeft: 58 }}>
						<EditableText value={pr.name} onSave={(name) => act(() => api('PATCH', `/api/admin/touchpoints/persons/${pr.id}`, { name }))} muted />
					</td>
					<td style={{ textAlign: 'right', color: 'var(--fg-muted)' }}>—</td>
					{weekDates.map((d) => (
						<td key={d} style={{ textAlign: 'center', padding: '2px 4px' }}>
							<DayCell value={countFor(pr.id, d)} onSave={(count) => act(() => api('POST', '/api/admin/touchpoints/set-day', { person_id: pr.id, touchpoint_date: d, count }))} />
						</td>
					))}
					<td className="num" style={{ textAlign: 'right', fontWeight: 600 }}>{personActual(pr.id)}</td>
					<td style={{ textAlign: 'right', color: 'var(--fg-muted)' }}>—</td>
					<td style={{ textAlign: 'right' }}>
						<IconDelete onClick={async () => { if (await confirm({ title: `Remove "${pr.name}"?`, message: 'The person is deactivated; their logged history is kept.', danger: true, confirmLabel: 'Remove' })) act(() => api('DELETE', `/api/admin/touchpoints/persons/${pr.id}`)); }} />
					</td>
				</tr>
			))}
			<tr>
				<td colSpan={DAYS.length + 4} style={{ paddingLeft: 58 }}>
					<AddButton label="Add person" placeholder="Person name" extra="Email (optional)" onAdd={(name, extra) => act(() => api('POST', '/api/admin/touchpoints/persons', { channel_id: ch.id, name, email: extra }))} small />
				</td>
			</tr>
		</>
	);
}

// ── Team view pivot ─────────────────────────────────────────────────────────
function TeamView(props: {
	products: Product[]; channels: Channel[]; persons: Person[];
	channelActual: (cid: string) => number;
	personActual: (pid: string) => number;
	personsOf: (cid: string) => Person[];
	channelsOf: (pid: string) => Channel[];
}) {
	const { products, channels, persons, channelActual, personActual, personsOf, channelsOf } = props;
	// Rows = unique person names; columns = channels (grouped by product).
	const names = Array.from(new Set(persons.map((p) => p.name.trim()))).sort();
	const cellFor = (name: string, cid: string) =>
		personsOf(cid).filter((p) => p.name.trim() === name).reduce((s, p) => s + personActual(p.id), 0);

	if (channels.length === 0) return <Section title="Team view"><div style={{ padding: 16, color: 'var(--fg-muted)', fontSize: 13 }}>No channels yet.</div></Section>;

	return (
		<Section title="Team view" meta="weekly totals by person × channel">
			<div className="table-scroll">
				<table className="data-table">
					<thead>
						<tr>
							<th>Person</th>
							{products.flatMap((prod) => channelsOf(prod.id).map((ch) => (
								<th key={ch.id} style={{ textAlign: 'center' }}>
									<div style={{ fontSize: 10, color: 'var(--fg-muted)', fontWeight: 500 }}>{prod.name}</div>
									{ch.name}
								</th>
							)))}
							<th style={{ textAlign: 'right' }}>Total</th>
						</tr>
					</thead>
					<tbody>
						{names.map((name) => {
							const rowTotal = channels.reduce((s, c) => s + cellFor(name, c.id), 0);
							return (
								<tr key={name}>
									<td style={{ fontWeight: 600 }}>{name}</td>
									{products.flatMap((prod) => channelsOf(prod.id).map((ch) => {
										const v = cellFor(name, ch.id);
										return <td key={ch.id} className="num" style={{ textAlign: 'center', color: v ? 'var(--fg)' : 'var(--fg-muted)' }}>{v || ''}</td>;
									}))}
									<td className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{rowTotal}</td>
								</tr>
							);
						})}
						<tr style={{ background: 'var(--bg-2)' }}>
							<td style={{ fontWeight: 700 }}>Total</td>
							{products.flatMap((prod) => channelsOf(prod.id).map((ch) => (
								<td key={ch.id} className="num" style={{ textAlign: 'center', fontWeight: 700 }}>{channelActual(ch.id) || ''}</td>
							)))}
							<td className="num" style={{ textAlign: 'right', fontWeight: 800 }}>{channels.reduce((s, c) => s + channelActual(c.id), 0)}</td>
						</tr>
					</tbody>
				</table>
			</div>
		</Section>
	);
}

// ── Small inline-edit primitives ────────────────────────────────────────────
function EditableText({ value, onSave, bold, muted }: { value: string; onSave: (v: string) => void; bold?: boolean; muted?: boolean }) {
	const [editing, setEditing] = useState(false);
	const [v, setV] = useState(value);
	if (editing) {
		return (
			<input
				className="search-input"
				style={{ height: 28, width: 200 }}
				value={v}
				autoFocus
				onChange={(e) => setV(e.target.value)}
				onBlur={() => { setEditing(false); if (v.trim() && v !== value) onSave(v.trim()); else setV(value); }}
				onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(value); setEditing(false); } }}
			/>
		);
	}
	return (
		<span onClick={() => setEditing(true)} style={{ cursor: 'text', fontWeight: bold ? 700 : 500, color: muted ? 'var(--fg-2)' : 'var(--fg)' }} title="Click to rename">{value}</span>
	);
}

function EditableNumber({ value, onSave }: { value: number; onSave: (v: number) => void }) {
	const [editing, setEditing] = useState(false);
	const [v, setV] = useState(String(value));
	if (editing) {
		return (
			<input
				className="search-input num"
				style={{ height: 28, width: 64, textAlign: 'right' }}
				value={v}
				inputMode="numeric"
				autoFocus
				onChange={(e) => setV(e.target.value)}
				onBlur={() => { setEditing(false); const n = Math.max(0, Number(v) || 0); if (n !== value) onSave(n); setV(String(n)); }}
				onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
			/>
		);
	}
	return <span className="num" onClick={() => setEditing(true)} style={{ cursor: 'text', fontWeight: 600 }} title="Click to edit target">{value}</span>;
}

function DayCell({ value, onSave }: { value: number; onSave: (v: number) => void }) {
	const [editing, setEditing] = useState(false);
	const [v, setV] = useState(String(value || ''));
	if (editing) {
		return (
			<input
				className="search-input num"
				style={{ height: 26, width: 44, textAlign: 'center', padding: '0 4px' }}
				value={v}
				inputMode="numeric"
				autoFocus
				onChange={(e) => setV(e.target.value)}
				onBlur={() => { setEditing(false); const n = Math.max(0, Number(v) || 0); if (n !== value) onSave(n); }}
				onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
			/>
		);
	}
	return (
		<span onClick={() => setEditing(true)} style={{ cursor: 'pointer', display: 'inline-block', minWidth: 24, padding: '3px 0', fontFamily: 'var(--font-mono)', fontWeight: value ? 700 : 400, color: value ? 'var(--fg)' : 'var(--fg-muted)' }} title="Click to log">
			{value || '·'}
		</span>
	);
}

function IconDelete({ onClick }: { onClick: () => void }) {
	return (
		<button onClick={onClick} className="btn ghost" style={{ height: 26, width: 26, padding: 0, justifyContent: 'center' }} title="Delete">
			<Trash2 size={13} style={{ color: 'var(--neg)' }} />
		</button>
	);
}

function AddButton({ label, placeholder, extra, onAdd, small }: { label: string; placeholder: string; extra?: string; onAdd: (name: string, extra: string) => void; small?: boolean }) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useState('');
	const [ex, setEx] = useState('');
	if (!open) {
		return <button className="btn ghost" style={small ? { height: 28, fontSize: 12 } : undefined} onClick={() => setOpen(true)}><Plus size={13} /> {label}</button>;
	}
	const submit = () => { if (name.trim()) { onAdd(name.trim(), ex.trim()); setName(''); setEx(''); setOpen(false); } };
	return (
		<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
			<input className="search-input" style={{ height: 28, width: 180 }} placeholder={placeholder} value={name} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setOpen(false); }} />
			{extra && <input className="search-input" style={{ height: 28, width: 130 }} placeholder={extra} value={ex} onChange={(e) => setEx(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />}
			<button className="btn" style={{ height: 28 }} onClick={submit}>Add</button>
			<button className="btn ghost" style={{ height: 28 }} onClick={() => setOpen(false)}>Cancel</button>
		</span>
	);
}
