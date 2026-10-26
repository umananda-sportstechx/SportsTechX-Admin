'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Trash2, Save, Pencil, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { Select } from '@/components/select';
import { useConfirm } from '@/components/confirm';
import { Modal } from '@/components/modal';
import { PageHeader, AsyncState, StatCard, Section } from '@/components/atoms';
import { StatStrip } from '@/components/filters';
import { PieDonut, PieLegend, toSegments } from '@/components/charts';

interface Edition { id: string; year: number; month: number; title: string | null; summary: string | null; is_published: boolean }
interface NewsItem {
	id: string; year: number; month: number; section: string; category: string | null;
	headline: string; body: string | null; org: string | null; geo: string | null;
	source_url: string | null; sort_order: number; is_active: boolean;
}

const MONTHS = [
	[1, 'January'], [2, 'February'], [3, 'March'], [4, 'April'], [5, 'May'], [6, 'June'],
	[7, 'July'], [8, 'August'], [9, 'September'], [10, 'October'], [11, 'November'], [12, 'December'],
] as const;
const NOW = new Date();
const YEARS = Array.from({ length: 7 }, (_, i) => NOW.getUTCFullYear() - i);
const defaultMonth = () => (NOW.getUTCMonth() === 0 ? { y: NOW.getUTCFullYear() - 1, m: 12 } : { y: NOW.getUTCFullYear(), m: NOW.getUTCMonth() });

export default function MarketRoundupAdminPage() {
	const { mutate } = useSWRConfig();
	const ask = useConfirm();
	const init = defaultMonth();
	const [year, setYear] = useState(init.y);
	const [month, setMonth] = useState(init.m);
	const [editItem, setEditItem] = useState<NewsItem | null>(null);
	const [creating, setCreating] = useState(false);

	const edition = useSWR<{ edition: Edition | null }>(['/api/admin/market/roundup/edition', { year, month }], { dedupingInterval: 10_000 });
	const news = useSWR<{ data: NewsItem[] }>(['/api/admin/market/roundup/news', { year, month }], { dedupingInterval: 10_000 });

	const refresh = () => mutate((key) => Array.isArray(key) && typeof key[0] === 'string' && key[0].startsWith('/api/admin/market/roundup'));

	const toggleActive = async (n: NewsItem) => {
		try { await api('PATCH', `/api/admin/market/roundup/news/${n.id}`, { is_active: !n.is_active }); void refresh(); }
		catch (e) { toast.error((e as Error).message); }
	};
	const remove = async (n: NewsItem) => {
		if (!(await ask('Delete this news item?'))) return;
		try { await api('DELETE', `/api/admin/market/roundup/news/${n.id}`); toast.success('Deleted'); void refresh(); }
		catch (e) { toast.error((e as Error).message); }
	};

	return (
		<div>
			<PageHeader
				kicker="Client Market page"
				title="Market roundup"
				subtitle="Monthly Funding & M&A analytics (computed live from deal data, as the old Intelligence Hub roundup), plus the editorial header and curated news for the client /roundup page."
			/>

			<div className="filter-bar" style={{ marginBottom: 12 }}>
				<Select value={String(month)} onChange={(v) => setMonth(Number(v))} width={160} options={MONTHS.map(([v, l]) => ({ value: String(v), label: l }))} />
				<Select value={String(year)} onChange={(v) => setYear(Number(v))} width={110} options={YEARS.map((y) => ({ value: String(y), label: String(y) }))} />
			</div>

			<RoundupPreview year={year} month={month} />

			<EditionEditor key={`${year}-${month}`} year={year} month={month} edition={edition.data?.edition ?? null} onSaved={refresh} />

			<div className="filter-bar" style={{ margin: '20px 0 12px' }}>
				<div style={{ fontWeight: 700, fontSize: 15 }}>News items</div>
				<div style={{ flex: 1 }} />
				<button className="btn" onClick={() => setCreating(true)}><Plus size={12} /> New item</button>
			</div>

			<AsyncState loading={news.isLoading} error={news.error} empty={(news.data?.data ?? []).length === 0} emptyMsg="No news items for this month yet." onRetry={() => void refresh()}>
				<div style={{ display: 'grid', gap: 10 }}>
					{(news.data?.data ?? []).map((n) => (
						<div key={n.id} className="card" style={{ padding: 'var(--space-4)', opacity: n.is_active ? 1 : 0.55 }}>
							<div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
								<div style={{ minWidth: 0 }}>
									<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', marginBottom: 4 }}>
										{n.section}{n.category ? ` · ${n.category}` : ''}{n.org ? ` · ${n.org}` : ''}{n.geo ? ` · ${n.geo}` : ''}
									</div>
									<div style={{ fontWeight: 700, fontSize: 15 }}>{n.headline}</div>
									{n.body && <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 4 }}>{n.body}</div>}
								</div>
								<div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
									<button className="btn ghost" onClick={() => void toggleActive(n)} title={n.is_active ? 'Hide' : 'Show'}>{n.is_active ? <Eye size={12} /> : <EyeOff size={12} />}</button>
									<button className="btn ghost" onClick={() => setEditItem(n)}><Pencil size={12} /></button>
									<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void remove(n)}><Trash2 size={12} /></button>
								</div>
							</div>
						</div>
					))}
				</div>
			</AsyncState>

			{(creating || editItem) && (
				<NewsModal
					year={year} month={month} item={editItem}
					onClose={() => { setCreating(false); setEditItem(null); }}
					onSaved={() => { setCreating(false); setEditItem(null); void refresh(); }}
				/>
			)}
		</div>
	);
}

interface Grouping { label: string; deal_count: number; total_amount: number }
interface RoundupData {
	mode: 'funding' | 'ma'; perspective?: 'acquiree' | 'acquirer';
	stats: { total_amount: number; count: number; largest_amount: number; largest_company: string | null; prev_total_amount: number; prev_count: number };
	by_sector: Grouping[]; by_sub_sector?: Grouping[]; by_business_model: Grouping[]; by_geo: Grouping[];
}
interface PreviewDealRow {
	id: string; amount_usd?: number | string | null;
	// funding (GET /api/deals)
	company_name?: string | null; company_website?: string | null; company_custom_logo_url?: string | null; round_type_name?: string | null;
	hq_city?: string | null; hq_country?: string | null; // deals: the company's HQ; acquisitions: the acquiree's
	// M&A (GET /api/acquisitions)
	acquiree_name?: string | null; acquiree_website?: string | null; acquiree_website_snapshot?: string | null; acquiree_logo?: string | null;
	acquirer_name?: string | null; acquirer_website?: string | null; acquirer_logo?: string | null; acquirer_city?: string | null; acquirer_country?: string | null;
}

const fmtUsdP = (n: number): string => (n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString()}`);
const pad2 = (n: number) => String(n).padStart(2, '0');
function deltaPct(cur?: number, prev?: number): number | null {
	if (cur == null || prev == null || prev === 0) return null;
	return Math.round(((cur - prev) / prev) * 100);
}

/**
 * Monthly Funding & M&A roundup analytics — parity with the old Intelligence Hub
 * /analytics/monthly-roundup: KPIs with month-over-month change (incl. average
 * deal size), sector/sub-sector · business-model · country donuts each with a
 * complete-breakdown table (value + share), and the month's full deal table with
 * logos and locations (both parties for M&A). Computed live from the same public
 * endpoints the client /roundup uses, so admins see exactly what users see.
 */
function RoundupPreview({ year, month }: { year: number; month: number }) {
	const [mode, setMode] = useState<'funding' | 'ma'>('funding');
	const [metric, setMetric] = useState<'amount' | 'count'>('amount');
	const [sectorView, setSectorView] = useState<'sector' | 'sub'>('sector');
	const [perspective, setPerspective] = useState<'acquiree' | 'acquirer'>('acquiree');
	const [breakdown, setBreakdown] = useState<{ title: string; dimension: string; rows: Grouping[] } | null>(null);

	const { data, isLoading, error } = useSWR<RoundupData>(['/api/market/roundup', { year, month, mode, ...(mode === 'ma' ? { perspective } : {}) }], { dedupingInterval: 10_000 });
	const start = `${year}-${pad2(month)}-01`;
	const end = `${year}-${pad2(month)}-${pad2(new Date(Date.UTC(year, month, 0)).getUTCDate())}`;
	// The whole month, like the old roundup and the client /roundup (not just a top-10).
	const dealsList = useSWR<{ data: PreviewDealRow[] }>(mode === 'funding'
		? ['/api/deals', { from: start, to: end, sort: '-amount_usd', limit: 50 }]
		: ['/api/acquisitions', { from: start, to: end, sort: '-amount_usd', limit: 50 }], { dedupingInterval: 10_000 });

	const s = data?.stats;
	const total = s?.total_amount ?? 0;
	const count = s?.count ?? 0;
	const avg = count > 0 ? total / count : 0;
	const prevAvg = s && s.prev_count > 0 ? s.prev_total_amount / s.prev_count : undefined;
	const val = (g: Grouping) => (metric === 'amount' ? g.total_amount : g.deal_count);
	const fmtVal = (n: number) => (metric === 'amount' ? fmtUsdP(n) : n.toLocaleString());
	const toSeg = (g: Grouping[]) => toSegments(g.slice(0, 8).map((x) => ({ label: x.label, value: val(x) })));
	const sectorG = (sectorView === 'sector' ? data?.by_sector : (data?.by_sub_sector ?? data?.by_sector)) ?? [];
	const noun = mode === 'ma' ? 'M&A' : 'Funding';
	const donuts: { title: string; dimension: string; rows: Grouping[] }[] = data
		? [
			{ title: `${noun} by ${sectorView === 'sector' ? 'sector' : 'sub-sector'}`, dimension: sectorView === 'sector' ? 'Sector' : 'Sub-sector', rows: sectorG },
			{ title: `${noun} by business model`, dimension: 'Business model', rows: data.by_business_model },
			{ title: `${noun} by country`, dimension: 'Country', rows: data.by_geo },
		]
		: [];
	const rows = dealsList.data?.data ?? [];
	const amountCell = (r: PreviewDealRow) => (r.amount_usd == null || Number(r.amount_usd) === 0 ? 'Undisclosed' : fmtUsdP(Number(r.amount_usd)));
	const breakdownSum = breakdown ? breakdown.rows.reduce((a, x) => a + val(x), 0) : 0;

	return (
		<Section title="Monthly roundup — Funding & M&A" meta="computed live — exactly what the client /roundup shows">
			<div className="filter-bar" style={{ marginBottom: 12, gap: 8 }}>
				<Select value={mode} onChange={(v) => setMode(v as 'funding' | 'ma')} width={120} options={[{ value: 'funding', label: 'Funding' }, { value: 'ma', label: 'M&A' }]} />
				<Select value={metric} onChange={(v) => setMetric(v as 'amount' | 'count')} width={120} options={[{ value: 'amount', label: 'Amount' }, { value: 'count', label: 'Count' }]} />
				<Select value={sectorView} onChange={(v) => setSectorView(v as 'sector' | 'sub')} width={140} options={[{ value: 'sector', label: 'Sector' }, { value: 'sub', label: 'Sub-sector' }]} />
				{mode === 'ma' && <Select value={perspective} onChange={(v) => setPerspective(v as 'acquiree' | 'acquirer')} width={140} options={[{ value: 'acquiree', label: 'Acquiree' }, { value: 'acquirer', label: 'Acquirer' }]} />}
			</div>
			<AsyncState loading={isLoading} error={error} empty={!!data && count === 0} emptyMsg="No deals recorded for this month.">
				<StatStrip cols={3}>
					<StatCard label={mode === 'ma' ? 'M&A value' : 'Capital raised'} value={fmtUsdP(total)} delta={deltaPct(total, s?.prev_total_amount)} />
					<StatCard label="Avg deal size" value={fmtUsdP(avg)} delta={deltaPct(avg, prevAvg)} />
					<StatCard label={mode === 'ma' ? 'Acquisitions' : 'Disclosed deals'} value={count.toLocaleString()} delta={deltaPct(count, s?.prev_count)} />
				</StatStrip>
				<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 16, marginTop: 16 }}>
					{donuts.map((d) => (
						<div className="card" key={d.title} style={{ padding: 16 }}>
							<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
								<div style={{ fontWeight: 700, fontSize: 14 }}>{d.title}</div>
								{d.rows.length > 0 && <button type="button" className="btn ghost" style={{ height: 24, padding: '0 8px', fontSize: 11 }} onClick={() => setBreakdown(d)}>Breakdown</button>}
							</div>
							{d.rows.length === 0 ? <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>No data.</div> : d.rows.every((x) => val(x) === 0) ? (
								// Deals exist but none disclosed a value — an all-$0 donut renders blank.
								<div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
									No disclosed values for these deals.{' '}
									<button type="button" className="btn ghost" style={{ padding: 0, height: 'auto' }} onClick={() => setMetric('count')}>View by count</button>
								</div>
							) : (
								<>
									<div style={{ display: 'grid', placeItems: 'center' }}><PieDonut mode="donut" size={150} segments={toSeg(d.rows)} /></div>
									<PieLegend segments={toSeg(d.rows)} />
								</>
							)}
						</div>
					))}
				</div>
				<div className="card" style={{ marginTop: 16, padding: 'var(--space-4)' }}>
					<div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>
						{mode === 'ma' ? 'Acquisitions this month' : 'Funding rounds this month'}{' '}
						<span style={{ fontWeight: 400, color: 'var(--fg-muted)', fontSize: 12 }}>· {rows.length}{rows.length === 50 ? '+' : ''} · largest first</span>
					</div>
					{dealsList.isLoading ? <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>Loading…</div> : rows.length === 0 ? <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>No {mode === 'ma' ? 'acquisitions' : 'rounds'} this month.</div> : (
						<div style={{ overflowX: 'auto' }}>
							<table className="data-table">
								<thead>
									{mode === 'ma'
										? <tr><th style={{ width: 32 }}>#</th><th>Acquiree</th><th>Location</th><th>Acquirer</th><th>Location</th><th style={{ textAlign: 'right' }}>Amount</th></tr>
										: <tr><th style={{ width: 32 }}>#</th><th>Company</th><th>Location</th><th>Round</th><th style={{ textAlign: 'right' }}>Amount</th></tr>}
								</thead>
								<tbody>
									{rows.map((r, i) => mode === 'ma' ? (
										<tr key={r.id}>
											<td className="num" style={{ color: 'var(--fg-muted)' }}>{i + 1}</td>
											<td><Party name={r.acquiree_name} website={r.acquiree_website ?? r.acquiree_website_snapshot} logo={r.acquiree_logo} /></td>
											<td>{place(r.hq_city, r.hq_country)}</td>
											<td><Party name={r.acquirer_name} website={r.acquirer_website} logo={r.acquirer_logo} /></td>
											<td>{place(r.acquirer_city, r.acquirer_country)}</td>
											<td className="num">{amountCell(r)}</td>
										</tr>
									) : (
										<tr key={r.id}>
											<td className="num" style={{ color: 'var(--fg-muted)' }}>{i + 1}</td>
											<td><Party name={r.company_name} website={r.company_website} logo={r.company_custom_logo_url} /></td>
											<td>{place(r.hq_city, r.hq_country)}</td>
											<td>{r.round_type_name ?? '—'}</td>
											<td className="num">{amountCell(r)}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</div>
			</AsyncState>

			{breakdown && (
				<Modal title={`${breakdown.title} — complete breakdown`} onClose={() => setBreakdown(null)} width={560}>
					<table className="data-table" style={{ width: '100%' }}>
						<thead><tr><th>{breakdown.dimension}</th><th style={{ textAlign: 'right' }}>{metric === 'amount' ? 'Amount' : 'Deals'}</th><th style={{ textAlign: 'right' }}>Share</th></tr></thead>
						<tbody>
							{[...breakdown.rows].sort((a, b) => val(b) - val(a)).map((x) => (
								<tr key={x.label}>
									<td>{x.label}</td>
									<td className="num">{fmtVal(val(x))}</td>
									<td className="num">{breakdownSum > 0 ? `${((val(x) / breakdownSum) * 100).toFixed(1)}%` : '—'}</td>
								</tr>
							))}
						</tbody>
					</table>
				</Modal>
			)}
		</Section>
	);
}

/** "City, Country" — or whichever half exists. */
const place = (city?: string | null, country?: string | null): string => [city, country].filter(Boolean).join(', ') || '—';

/** A company cell: logo (custom, else the site favicon — like the old roundup) + name linked to its website. */
function Party({ name, website, logo }: { name?: string | null; website?: string | null; logo?: string | null }) {
	const host = website ? website.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] : null;
	const src = logo || (host ? `https://www.google.com/s2/favicons?sz=64&domain=${host}` : null);
	return (
		<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			{src && <img src={src} alt="" width={18} height={18} style={{ objectFit: 'contain', borderRadius: 4 }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
			{host ? <a href={`https://${host}`} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>{name ?? host}</a> : <span>{name ?? '—'}</span>}
		</span>
	);
}

function EditionEditor({ year, month, edition, onSaved }: { year: number; month: number; edition: Edition | null; onSaved: () => void }) {
	const [title, setTitle] = useState(edition?.title ?? '');
	const [summary, setSummary] = useState(edition?.summary ?? '');
	const [published, setPublished] = useState(edition?.is_published ?? false);
	const [pending, setPending] = useState(false);

	const save = async () => {
		setPending(true);
		try {
			await api('PUT', '/api/admin/market/roundup/edition', {
				year, month,
				title: title.trim() || null,
				summary: summary.trim() || null,
				is_published: published,
			});
			toast.success('Edition saved');
			onSaved();
		} catch (e) { toast.error((e as Error).message); }
		finally { setPending(false); }
	};

	return (
		<div className="card" style={{ padding: 'var(--space-4)' }}>
			<div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Editorial header</div>
			<div style={{ display: 'grid', gap: 12 }}>
				<div>
					<div className="co-stat-label" style={{ marginBottom: 6 }}>Title</div>
					<input className="search-input" style={{ width: '100%' }} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. August 2026 roundup" />
				</div>
				<div>
					<div className="co-stat-label" style={{ marginBottom: 6 }}>Summary (falls back to an auto-generated line if empty)</div>
					<textarea className="search-input" style={{ width: '100%', minHeight: 90 }} value={summary} onChange={(e) => setSummary(e.target.value)} />
				</div>
				<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
					<label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
						<input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /> Published (visible on the client)
					</label>
					<button className="btn" disabled={pending} onClick={() => void save()}><Save size={12} /> {pending ? 'Saving…' : 'Save header'}</button>
				</div>
			</div>
		</div>
	);
}

function NewsModal({ year, month, item, onClose, onSaved }: { year: number; month: number; item: NewsItem | null; onClose: () => void; onSaved: () => void }) {
	const [section, setSection] = useState(item?.section ?? 'Highlights');
	const [category, setCategory] = useState(item?.category ?? '');
	const [headline, setHeadline] = useState(item?.headline ?? '');
	const [body, setBody] = useState(item?.body ?? '');
	const [org, setOrg] = useState(item?.org ?? '');
	const [geo, setGeo] = useState(item?.geo ?? '');
	const [sourceUrl, setSourceUrl] = useState(item?.source_url ?? '');
	const [sortOrder, setSortOrder] = useState(String(item?.sort_order ?? 0));
	const [pending, setPending] = useState(false);

	const submit = async () => {
		if (!headline.trim()) { toast.error('Headline is required'); return; }
		setPending(true);
		const payload = {
			section: section.trim() || 'Highlights',
			category: category.trim() || null,
			headline: headline.trim(),
			body: body.trim() || null,
			org: org.trim() || null,
			geo: geo.trim() || null,
			source_url: sourceUrl.trim() || null,
			sort_order: Number(sortOrder) || 0,
		};
		try {
			if (item) await api('PATCH', `/api/admin/market/roundup/news/${item.id}`, payload);
			else await api('POST', '/api/admin/market/roundup/news', { year, month, ...payload });
			toast.success(item ? 'Updated' : 'Created');
			onSaved();
		} catch (e) { toast.error((e as Error).message); }
		finally { setPending(false); }
	};

	return (
		<Modal
			title={item ? 'Edit news item' : 'New news item'}
			onClose={onClose}
			width={560}
			footer={
				<>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={!headline.trim() || pending} onClick={() => void submit()}><Save size={12} /> {pending ? 'Saving…' : 'Save'}</button>
				</>
			}
		>
			<div style={{ display: 'grid', gap: 12 }}>
				<Row label="Section"><input className="search-input" style={{ width: '100%' }} value={section} onChange={(e) => setSection(e.target.value)} placeholder="e.g. Deals & funding" /></Row>
				<Row label="Category (badge)"><input className="search-input" style={{ width: '100%' }} value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Funding" /></Row>
				<Row label="Headline"><input className="search-input" style={{ width: '100%' }} value={headline} onChange={(e) => setHeadline(e.target.value)} /></Row>
				<Row label="Body"><textarea className="search-input" style={{ width: '100%', minHeight: 90 }} value={body} onChange={(e) => setBody(e.target.value)} /></Row>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
					<Row label="Org tag"><input className="search-input" style={{ width: '100%' }} value={org} onChange={(e) => setOrg(e.target.value)} /></Row>
					<Row label="Geo tag"><input className="search-input" style={{ width: '100%' }} value={geo} onChange={(e) => setGeo(e.target.value)} /></Row>
				</div>
				<Row label="Source URL"><input className="search-input" style={{ width: '100%' }} value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" /></Row>
				<Row label="Sort order"><input className="search-input" style={{ width: 120 }} type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} /></Row>
			</div>
		</Modal>
	);
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
	return <div><div className="co-stat-label" style={{ marginBottom: 6 }}>{label}</div>{children}</div>;
}
