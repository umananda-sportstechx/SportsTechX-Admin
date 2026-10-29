'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSWRConfig } from 'swr';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Modal } from '@/components/modal';
import { Select } from '@/components/select';

type Tier = 'explore' | 'raise' | 'scout';

interface Created { profile_id: string; email: string; tier: Tier; access_until: string | null; link: string; emailed: boolean }

const copy = (link: string) => { void navigator.clipboard.writeText(link); toast.success('Sign-in link copied'); };
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** The one-time link, with copy — shown after creating an account or issuing a link. */
function LinkBox({ link, emailed, email }: { link: string; emailed: boolean; email: string }) {
	return (
		<div style={{ display: 'grid', gap: 8 }}>
			<div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.5 }}>
				{emailed ? <>Emailed to <strong style={{ color: 'var(--fg)' }}>{email}</strong>. You can also share it directly:</> : <>Share this with <strong style={{ color: 'var(--fg)' }}>{email}</strong>:</>}
				{' '}it signs them in once, and expires after a while. Send a fresh one any time from their user page.
			</div>
			<div style={{ display: 'flex', gap: 6 }}>
				<input className="search-input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11 }} aria-label="Sign-in link" />
				<button className="btn" onClick={() => copy(link)}>Copy</button>
			</div>
		</div>
	);
}

/**
 * Create someone's account from the admin panel: a confirmed login (no signup
 * email, no password), an optional Raise/Scout comp for N days, and a one-tap
 * magic link — emailed to them and shown here to share.
 */
export function CreateAccountModal({ onClose }: { onClose: () => void }) {
	const { mutate } = useSWRConfig();
	const [email, setEmail] = useState('');
	const [name, setName] = useState('');
	const [tier, setTier] = useState<Tier>('raise');
	const [days, setDays] = useState(180);
	const [sendEmail, setSendEmail] = useState(true);
	const [pending, setPending] = useState(false);
	const [err, setErr] = useState<string | null>(null);
	const [done, setDone] = useState<Created | null>(null);

	const submit = async () => {
		setPending(true);
		setErr(null);
		try {
			const r = await api<Created>('POST', '/api/admin/accounts', {
				email: email.trim(),
				full_name: name.trim() || undefined,
				tier,
				days: tier === 'explore' ? undefined : days,
				send_email: sendEmail,
			});
			setDone(r);
			toast.success('Account created');
			void mutate((key) => Array.isArray(key) && String(key[0]).startsWith('/api/admin/users'));
			void mutate((key) => Array.isArray(key) && key[0] === '/api/admin/stats/users');
		} catch (e) {
			setErr((e as Error).message);
		} finally { setPending(false); }
	};

	if (done) {
		return (
			<Modal title="Account created" onClose={onClose} width={520} footer={<>
				<Link className="btn ghost" href={`/users/${done.profile_id}`} onClick={onClose}>Open user</Link>
				<button className="btn" onClick={onClose}>Done</button>
			</>}>
				<div style={{ display: 'grid', gap: 14 }}>
					<div style={{ fontSize: 13 }}>
						<strong>{done.email}</strong> is on <strong>{done.tier === 'explore' ? 'Explore' : done.tier === 'raise' ? 'Raise' : 'Scout'}</strong>
						{done.access_until ? <> until {day(done.access_until)}</> : null}.
					</div>
					<LinkBox link={done.link} emailed={done.emailed} email={done.email} />
				</div>
			</Modal>
		);
	}

	const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && (tier === 'explore' || days >= 1);
	return (
		<Modal title="Create account" onClose={onClose} width={520} footer={<>
			<button className="btn ghost" onClick={onClose}>Cancel</button>
			<button className="btn" disabled={!valid || pending} onClick={() => void submit()}>{pending ? 'Creating…' : 'Create account'}</button>
		</>}>
			<form style={{ display: 'grid', gap: 12 }} onSubmit={(e) => { e.preventDefault(); if (valid && !pending) void submit(); }}>
				<label style={{ display: 'grid', gap: 4 }}>
					<span className="co-stat-label">Email</span>
					<input className="search-input" type="email" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" />
				</label>
				<label style={{ display: 'grid', gap: 4 }}>
					<span className="co-stat-label">Full name (optional)</span>
					<input className="search-input" value={name} onChange={(e) => setName(e.target.value)} />
				</label>
				<div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 8 }}>
					<label style={{ display: 'grid', gap: 4 }}>
						<span className="co-stat-label">Plan</span>
						<Select value={tier} onChange={(v) => setTier(v as Tier)} width="100%" style={{ display: 'block', width: '100%' }}
							options={[{ value: 'raise', label: 'Raise' }, { value: 'scout', label: 'Scout' }, { value: 'explore', label: 'Explore (free)' }]} />
					</label>
					<label style={{ display: 'grid', gap: 4 }}>
						<span className="co-stat-label">Days</span>
						<input className="search-input" type="number" min={1} max={3650} disabled={tier === 'explore'} value={tier === 'explore' ? '' : days}
							onChange={(e) => setDays(Math.max(1, Math.min(3650, Number(e.target.value) || 1)))} />
					</label>
				</div>
				{tier !== 'explore' && (
					<div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>No payment: they get {tier === 'raise' ? 'Raise' : 'Scout'} and its monthly credits for {days} day{days === 1 ? '' : 's'}, then move to Explore unless they subscribe.</div>
				)}
				<label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
					<input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
					Email them the sign-in link
				</label>
				{err && <div role="alert" style={{ fontSize: 12, color: 'var(--neg)' }}>{err}</div>}
			</form>
		</Modal>
	);
}

/** On a user's page: a fresh one-tap sign-in link (first one expired, or no password yet). */
export function SignInLinkSection({ profileId, email }: { profileId: string; email: string | null }) {
	const [pending, setPending] = useState<'email' | 'copy' | null>(null);
	const [issued, setIssued] = useState<{ link: string; emailed: boolean } | null>(null);
	const issue = async (sendEmail: boolean) => {
		setPending(sendEmail ? 'email' : 'copy');
		try {
			const r = await api<{ link: string; emailed: boolean }>('POST', `/api/admin/accounts/${profileId}/sign-in-link`, { send_email: sendEmail });
			setIssued(r);
			if (sendEmail) toast.success('Sign-in link emailed');
			else copy(r.link);
		} catch (e) { toast.error((e as Error).message); }
		finally { setPending(null); }
	};
	return (
		<div>
			<div className="co-stat-label" style={{ marginBottom: 8 }}>Sign-in link</div>
			<div style={{ fontSize: 12, color: 'var(--fg-muted)', marginBottom: 8, lineHeight: 1.5 }}>
				A one-time link that signs them straight in — no password needed.
			</div>
			<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: issued ? 10 : 0 }}>
				<button className="btn" disabled={pending !== null} onClick={() => void issue(true)}>{pending === 'email' ? 'Sending…' : 'Email link'}</button>
				<button className="btn ghost" disabled={pending !== null} onClick={() => void issue(false)}>{pending === 'copy' ? 'Creating…' : 'Copy link'}</button>
			</div>
			{issued && <LinkBox link={issued.link} emailed={issued.emailed} email={email ?? 'them'} />}
		</div>
	);
}
