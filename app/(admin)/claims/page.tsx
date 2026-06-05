'use client';

import { Fragment, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { api } from '@/lib/api';
import { PageHeader, AsyncState, StatCard, Section } from '@/components/atoms';
import { Funnel } from '@/components/charts';
import { StatStrip } from '@/components/filters';
import { SectorCascade, LocationFields, EMPTY_LOCATION, type LocationValue } from '@/components/entity-pickers';
import { YearSelect } from '@/components/year-select';

type ClaimStatus = 'pending' | 'picked_up' | 'verified' | 'rejected';
interface QueueStats { claims: { pending: number; picked_up: number; verified: number; rejected: number } }

interface Claim {
	id: string;
	claim_type: string;
	profile_id: string | null;
	entity_type?: string | null;
	entity_id?: string | null;
	entity_name?: string | null;
	claimant_email?: string | null;
	claimant_name?: string | null;
	company_email?: string | null;
	position_at_company?: string | null;
	status: ClaimStatus;
	is_verified: boolean;
	picked_up_at: string | null;
	verified_at: string | null;
	rejection_reason?: string | null;
	new_entry_request?: boolean;
	target_website_snapshot?: string | null;
	created_at: string;
}

interface ClaimsResponse { data: Claim[]; total: number; totalPages: number }

const STATUS_TABS: Array<{ label: string; key: ClaimStatus }> = [
	{ label: 'Pending', key: 'pending' },
	{ label: 'Picked up', key: 'picked_up' },
	{ label: 'Verified', key: 'verified' },
	{ label: 'Rejected', key: 'rejected' },
];

export default function ClaimsAdminPage() {
	const { mutate } = useSWRConfig();
	const [status, setStatus] = useState<ClaimStatus>('pending');
	const [page, setPage] = useState(1);
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [sendEmail, setSendEmail] = useState(true);
	const [expandedId, setExpandedId] = useState<string | null>(null);

	const { data, error, isLoading } = useSWR<ClaimsResponse>(
		['/api/admin/claims', { status, page, limit: 30 }],
		{ dedupingInterval: 30_000 },
	);
	const stats = useSWR<QueueStats>(['/api/admin/stats/queues'], { dedupingInterval: 60_000 });
	const c = stats.data?.claims;

	const claims = data?.data ?? [];

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/admin/claims');

	const act = async (id: string, fn: () => Promise<unknown>, ok: string) => {
		setPendingId(id);
		try {
			await fn();
			toast.success(ok);
			void refresh();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setPendingId(null);
		}
	};

	const pickup = (id: string) => act(id, () => api('POST', `/api/admin/claims/${id}/pickup`, { picked_up: true }), 'Claim picked up');
	const verify = (id: string) => act(id, () => api('POST', `/api/admin/claims/${id}/verify`, { send_email: sendEmail }), 'Claim verified');
	const reject = (id: string) => {
		const reason = window.prompt('Reason for rejection (optional):') ?? undefined;
		if (reason === undefined) return; // cancelled
		void act(id, () => api('POST', `/api/admin/claims/${id}/reject`, { reason }), 'Claim rejected');
	};
	const reopen = (id: string) => act(id, () => api('POST', `/api/admin/claims/${id}/reopen`), 'Claim re-opened');

	return (
		<div>
			<PageHeader kicker={`Queues · ${(data?.total ?? 0).toLocaleString()} in ${status}`} title="Claims" />

			<StatStrip cols={4}>
				<StatCard label="Pending" loading={stats.isLoading} value={(c?.pending ?? 0).toLocaleString()} urgent={(c?.pending ?? 0) > 0} />
				<StatCard label="Picked up" loading={stats.isLoading} value={(c?.picked_up ?? 0).toLocaleString()} />
				<StatCard label="Verified" loading={stats.isLoading} value={(c?.verified ?? 0).toLocaleString()} />
				<StatCard label="Rejected" loading={stats.isLoading} value={(c?.rejected ?? 0).toLocaleString()} />
			</StatStrip>

			<Section title="Claim funnel" meta="pending → verified">
				<Funnel stages={[
					{ label: 'Pending', value: c?.pending ?? 0 },
					{ label: 'Picked up', value: c?.picked_up ?? 0 },
					{ label: 'Verified', value: c?.verified ?? 0, color: 'var(--pos)' },
					{ label: 'Rejected', value: c?.rejected ?? 0, color: 'var(--neg)' },
				]} />
			</Section>

			<div style={{ height: 'var(--space-4)' }} />

			<div className="filter-bar" style={{ marginBottom: 'var(--space-4)', alignItems: 'center' }}>
				{STATUS_TABS.map((t) => (
					<button key={t.key} className={`chip ${status === t.key ? 'on' : ''}`} onClick={() => { setStatus(t.key); setPage(1); }}>
						{t.label}
					</button>
				))}
				<div style={{ flex: 1 }} />
				<label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: 'var(--fg-2)' }}>
					<input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Send email on verify
				</label>
			</div>

			<div className="card">
				<AsyncState loading={isLoading} error={error} empty={claims.length === 0} emptyMsg={`No ${status} claims`} onRetry={() => void refresh()}>
					<table className="data-table">
						<thead>
							<tr>
								<th>Created</th>
								<th>Type</th>
								<th>Target</th>
								<th>Claimant</th>
								<th>Status</th>
								<th style={{ textAlign: 'right' }}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{claims.map((c) => (
								<Fragment key={c.id}>
								<tr>
									<td className="num">
										<button className="btn ghost" style={{ padding: '2px 4px', marginRight: 4 }} onClick={() => setExpandedId(expandedId === c.id ? null : c.id)} aria-label="Toggle details">
											{expandedId === c.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
										</button>
										{new Date(c.created_at).toLocaleDateString()}
									</td>
									<td>{c.entity_type ?? c.claim_type}</td>
									<td>
										<div style={{ fontWeight: 600 }}>{c.entity_name ?? c.entity_id ?? '—'}</div>
										{c.position_at_company && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{c.position_at_company}</div>}
									</td>
									<td style={{ fontSize: 12 }}>
										<div>{c.claimant_email ?? c.company_email ?? '—'}</div>
										{c.claimant_name && <div style={{ color: 'var(--fg-muted)' }}>{c.claimant_name}</div>}
									</td>
									<td>
										{c.status === 'rejected'
											? <span className="tag neg" title={c.rejection_reason ?? undefined}>Rejected</span>
											: c.status === 'verified'
												? <span className="tag pos">Verified</span>
												: c.status === 'picked_up'
													? <span className="tag">Picked up</span>
													: <span className="tag">Pending</span>}
									</td>
									<td style={{ textAlign: 'right' }}>
										<div style={{ display: 'inline-flex', gap: 6 }}>
											{c.status === 'pending' && (
												<button className="btn ghost" disabled={pendingId === c.id} onClick={() => void pickup(c.id)}>Pick up</button>
											)}
											{c.status !== 'verified' && c.status !== 'rejected' && (
												<button className="btn" disabled={pendingId === c.id} onClick={() => void verify(c.id)}>Verify</button>
											)}
											{c.status !== 'rejected' && (
												<button className="btn ghost" style={{ color: 'var(--accent)' }} disabled={pendingId === c.id} onClick={() => reject(c.id)}>Reject</button>
											)}
											{c.status === 'rejected' && (
												<button className="btn ghost" disabled={pendingId === c.id} onClick={() => void reopen(c.id)}>Re-open</button>
											)}
										</div>
									</td>
								</tr>
								{expandedId === c.id && (
									<tr>
										<td colSpan={6} style={{ background: 'var(--bg-2)' }}>
											<div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: '4px 4px 10px', fontSize: 12 }}>
												<div><div className="co-stat-label">Claim type</div>{c.claim_type}</div>
												<div><div className="co-stat-label">Target</div>{c.entity_name ?? c.entity_id ?? '—'}</div>
												<div><div className="co-stat-label">Position</div>{c.position_at_company ?? '—'}</div>
												<div><div className="co-stat-label">Claimant</div>{c.claimant_name ?? '—'}</div>
												<div><div className="co-stat-label">Claimant email</div>{c.claimant_email ?? '—'}</div>
												<div><div className="co-stat-label">Company email</div>{c.company_email ?? '—'}</div>
												<div><div className="co-stat-label">Submitted</div>{new Date(c.created_at).toLocaleString()}</div>
												<div><div className="co-stat-label">Picked up</div>{c.picked_up_at ? new Date(c.picked_up_at).toLocaleString() : '—'}</div>
												<div><div className="co-stat-label">Verified</div>{c.verified_at ? new Date(c.verified_at).toLocaleString() : '—'}</div>
												{c.rejection_reason && <div style={{ gridColumn: '1 / -1' }}><div className="co-stat-label">Rejection reason</div>{c.rejection_reason}</div>}
											</div>
											{c.new_entry_request && !c.entity_id ? (
												<CreateEntityPanel claim={c} onDone={() => void refresh()} />
											) : (
												<div style={{ padding: '0 4px 10px', fontSize: 11, color: 'var(--fg-muted)' }}>
													Verifying applies the claim to the live {c.entity_type ?? 'record'} (and emails the claimant if enabled). Field-level edits submitted with this claim appear under Data requests.
												</div>
											)}
										</td>
									</tr>
								)}
								</Fragment>
							))}
						</tbody>
					</table>
				</AsyncState>
			</div>

			{data && data.totalPages > 1 && (
				<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
					<span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', alignSelf: 'center', marginRight: 8 }}>
						Page {page} of {data.totalPages}
					</span>
					<button className="btn ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
					<button className="btn ghost" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
				</div>
			)}
		</div>
	);
}

const BUSINESS_MODELS = ['b2b', 'b2c', 'b2b2c', 'd2c', 'b2g', 'other'] as const;
const INVESTOR_CATEGORIES = ['venture_capital', 'private_equity', 'financial_services', 'family_investment_office', 'sovereign_wealth_fund', 'angel', 'other'] as const;
const ECOSYSTEM_TYPES = ['program', 'event', 'organization', 'initiative'] as const;

/**
 * Edit-then-create panel for a NEW-entity claim. Name/website come prefilled
 * from the claim; the admin fills the rest and clicks Create — the server makes
 * the live record, links it to the claim, and verifies in one call.
 */
function CreateEntityPanel({ claim, onDone }: { claim: Claim; onDone: () => void }) {
	const kind = claim.claim_type; // 'company' | 'investor' | 'ecosystem_entity'
	const [name, setName] = useState(claim.entity_name ?? '');
	const [website, setWebsite] = useState(claim.target_website_snapshot ?? '');
	const [description, setDescription] = useState('');
	const [sectorId, setSectorId] = useState('');
	const [businessModel, setBusinessModel] = useState('');
	const [category, setCategory] = useState('');
	const [entityType, setEntityType] = useState('program');
	const [year, setYear] = useState('');
	const [hq, setHq] = useState<LocationValue>({ ...EMPTY_LOCATION });
	const [pending, setPending] = useState(false);

	const submit = async () => {
		if (!name.trim()) { toast.error('Name is required.'); return; }
		setPending(true);
		try {
			const body: Record<string, unknown> = {
				name: name.trim(),
				website: website.trim() || undefined,
				description: description.trim() || undefined,
				hq_country: hq.country.trim() || undefined,
				hq_city: hq.city.trim() || undefined,
				hq_continent: hq.continent.trim() || undefined,
				hq_region: hq.region.trim() || undefined,
				hq_state: hq.state.trim() || undefined,
			};
			if (kind === 'company') {
				if (sectorId) body.sector_id = sectorId;
				if (businessModel) body.business_model = businessModel;
				if (year) body.founded_year = Number(year);
			} else if (kind === 'investor') {
				if (category) body.category = category;
				if (year) body.year_launched = Number(year);
			} else {
				body.entity_type = entityType;
				if (category) body.category = category;
				if (year) body.founded_year = Number(year);
			}
			await api('POST', `/api/admin/claims/${claim.id}/create-entity`, body);
			toast.success('Record created, linked & verified');
			onDone();
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setPending(false);
		}
	};

	const L = (label: string, node: React.ReactNode) => (
		<div><div className="co-stat-label" style={{ marginBottom: 4 }}>{label}</div>{node}</div>
	);

	return (
		<div style={{ padding: '4px 4px 12px', display: 'grid', gap: 10 }}>
			<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
				This is a <strong>new {kind.replace('_', ' ')}</strong> request — review &amp; edit, then create it as a live record.
			</div>
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
				{L('Name', <input className="search-input" value={name} onChange={(e) => setName(e.target.value)} />)}
				{L('Website', <input className="search-input" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />)}
			</div>
			{L('Description', <textarea className="search-input" style={{ minHeight: 56, resize: 'vertical' }} value={description} onChange={(e) => setDescription(e.target.value)} />)}
			<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
				{kind === 'company' && L('Sector', <SectorCascade value={sectorId} onChange={setSectorId} />)}
				{kind === 'company' && L('Business model', (
					<select className="search-input" value={businessModel} onChange={(e) => setBusinessModel(e.target.value)}>
						<option value="">—</option>
						{BUSINESS_MODELS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}
					</select>
				))}
				{kind === 'investor' && L('Category', (
					<select className="search-input" value={category} onChange={(e) => setCategory(e.target.value)}>
						<option value="">—</option>
						{INVESTOR_CATEGORIES.map((c) => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
					</select>
				))}
				{kind === 'ecosystem_entity' && L('Type', (
					<select className="search-input" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
						{ECOSYSTEM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
					</select>
				))}
				{kind === 'ecosystem_entity' && L('Category', <input className="search-input" value={category} onChange={(e) => setCategory(e.target.value)} />)}
				{L(kind === 'investor' ? 'Year launched' : 'Founded year', <YearSelect value={year} onChange={setYear} />)}
			</div>
			{L('Headquarters', <LocationFields value={hq} onChange={setHq} />)}
			<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
				<button className="btn" disabled={pending || !name.trim()} onClick={() => void submit()}>
					{pending ? 'Creating…' : `Create & verify ${kind.replace('_', ' ')}`}
				</button>
			</div>
		</div>
	);
}
