'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { Plus, Trash2, X, Save } from 'lucide-react';
import { api } from '@/lib/api';

interface PollOption { id: string; poll_id: string; label: string; sort_order: number }
interface Poll {
	id: string;
	report_id: string;
	question: string;
	is_open: boolean;
	sort_order: number;
	options: PollOption[];
}
interface PollsResponse { data: Poll[] }
interface Report { id: string; title: string }
interface ReportsResponse { data: Report[] }

export default function PollsAdminPage() {
	const { mutate } = useSWRConfig();
	const [reportFilter, setReportFilter] = useState<string>('');
	const [creating, setCreating] = useState(false);

	const { data: polls } = useSWR<PollsResponse>(
		['/api/admin/polls', { report_id: reportFilter || undefined }],
		{ dedupingInterval: 30_000 },
	);
	const { data: reports } = useSWR<ReportsResponse>(['/api/reports'], { dedupingInterval: 5 * 60_000 });

	const refresh = () => mutate((key) => Array.isArray(key) && key[0] === '/api/admin/polls');

	const togglePoll = async (poll: Poll) => {
		try {
			await api('PATCH', `/api/admin/polls/${poll.id}`, { is_open: !poll.is_open });
			toast.success(poll.is_open ? 'Closed' : 'Opened');
			void refresh();
		} catch (e) { toast.error((e as Error).message); }
	};

	const removePoll = async (id: string) => {
		if (!confirm('Delete poll? Votes will be removed too.')) return;
		try { await api('DELETE', `/api/admin/polls/${id}`); toast.success('Deleted'); void refresh(); }
		catch (e) { toast.error((e as Error).message); }
	};

	const removeOption = async (optionId: string) => {
		try { await api('DELETE', `/api/admin/polls/options/${optionId}`); void refresh(); }
		catch (e) { toast.error((e as Error).message); }
	};

	const addOption = async (pollId: string, label: string) => {
		if (!label.trim()) return;
		try { await api('POST', `/api/admin/polls/${pollId}/options`, { label: label.trim() }); void refresh(); }
		catch (e) { toast.error((e as Error).message); }
	};

	return (
		<div>
			<div style={{ marginBottom: 'var(--space-5)' }}>
				<div className="co-stat-label" style={{ marginBottom: 6 }}>Reader engagement</div>
				<h1 style={{ fontFamily: 'var(--font-display)', fontSize: 38, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>Polls</h1>
				<p style={{ fontSize: 14, color: 'var(--fg-2)', marginTop: 6 }}>
					Authored once here, then attached to report sections via the section editor's poll picker.
				</p>
			</div>

			<div className="filter-bar" style={{ marginBottom: 12 }}>
				<select className="search-input" style={{ flex: '0 0 280px' }} value={reportFilter} onChange={(e) => setReportFilter(e.target.value)}>
					<option value="">All reports</option>
					{(reports?.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
				</select>
				<div style={{ flex: 1 }} />
				<button className="btn" onClick={() => setCreating(true)} disabled={(reports?.data ?? []).length === 0}>
					<Plus size={12} /> New poll
				</button>
			</div>

			{creating && (
				<NewPollModal reports={reports?.data ?? []} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); void refresh(); }} />
			)}

			<div style={{ display: 'grid', gap: 12 }}>
				{(polls?.data ?? []).length === 0 && (
					<div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--fg-muted)' }}>No polls yet.</div>
				)}
				{(polls?.data ?? []).map((p) => (
					<div key={p.id} className="card" style={{ padding: 'var(--space-4)' }}>
						<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
							<div>
								<div style={{ fontWeight: 700, fontSize: 15 }}>{p.question}</div>
								<div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 4 }}>
									report: {p.report_id.slice(0, 8)} · {p.is_open ? 'open' : 'closed'}
								</div>
							</div>
							<div style={{ display: 'flex', gap: 6 }}>
								<button className="btn ghost" onClick={() => void togglePoll(p)}>
									{p.is_open ? 'Close' : 'Reopen'}
								</button>
								<button className="btn ghost" style={{ color: 'var(--accent)' }} onClick={() => void removePoll(p.id)}>
									<Trash2 size={12} />
								</button>
							</div>
						</div>
						<div style={{ display: 'grid', gap: 6 }}>
							{p.options.map((o) => (
								<div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
									<span style={{ flex: 1 }}>{o.label}</span>
									<button className="btn ghost" style={{ padding: '2px 6px' }} onClick={() => void removeOption(o.id)}><X size={11} /></button>
								</div>
							))}
							<AddOptionInline onAdd={(label) => void addOption(p.id, label)} />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function AddOptionInline({ onAdd }: { onAdd: (label: string) => void }) {
	const [label, setLabel] = useState('');
	return (
		<div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
			<input className="search-input" style={{ flex: 1 }} placeholder="Add option…" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && label.trim()) { onAdd(label); setLabel(''); } }} />
			<button className="btn ghost" disabled={!label.trim()} onClick={() => { onAdd(label); setLabel(''); }}><Plus size={12} /></button>
		</div>
	);
}

function NewPollModal({ reports, onClose, onSaved }: { reports: Report[]; onClose: () => void; onSaved: () => void }) {
	const [reportId, setReportId] = useState(reports[0]?.id ?? '');
	const [question, setQuestion] = useState('');
	const [optionsText, setOptionsText] = useState('Option A\nOption B');
	const [pending, setPending] = useState(false);

	const submit = async () => {
		setPending(true);
		try {
			const options = optionsText.split('\n').map((s) => s.trim()).filter(Boolean);
			if (options.length < 2) { toast.error('Need at least 2 options'); setPending(false); return; }
			await api('POST', '/api/admin/polls', { report_id: reportId, question: question.trim(), options });
			toast.success('Poll created');
			onSaved();
		} catch (e) { toast.error((e as Error).message); }
		finally { setPending(false); }
	};

	return (
		<div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 100 }} onClick={onClose}>
			<div className="card" style={{ width: 'min(520px, 92vw)', padding: 'var(--space-4)' }} onClick={(e) => e.stopPropagation()}>
				<div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
					<div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18 }}>New poll</div>
					<button className="btn ghost" onClick={onClose}><X size={12} /></button>
				</div>
				<div style={{ display: 'grid', gap: 12 }}>
					<div>
						<div className="co-stat-label" style={{ marginBottom: 6 }}>Report</div>
						<select className="search-input" style={{ width: '100%' }} value={reportId} onChange={(e) => setReportId(e.target.value)}>
							{reports.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
						</select>
					</div>
					<div>
						<div className="co-stat-label" style={{ marginBottom: 6 }}>Question</div>
						<input className="search-input" style={{ width: '100%' }} value={question} onChange={(e) => setQuestion(e.target.value)} />
					</div>
					<div>
						<div className="co-stat-label" style={{ marginBottom: 6 }}>Options (one per line)</div>
						<textarea className="search-input" style={{ width: '100%', minHeight: 100 }} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />
					</div>
				</div>
				<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
					<button className="btn ghost" onClick={onClose}>Cancel</button>
					<button className="btn" disabled={!reportId || !question.trim() || pending} onClick={() => void submit()}>
						<Save size={12} /> {pending ? 'Creating…' : 'Create'}
					</button>
				</div>
			</div>
		</div>
	);
}
