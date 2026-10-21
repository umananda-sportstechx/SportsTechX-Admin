'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PageHeader, AsyncState, Section } from '@/components/atoms';

/**
 * System settings — global, runtime-toggleable switches the admin panel owns.
 *
 * Today it carries the pre-launch email kill switch. While it is on, the app
 * sends ONLY transactional auth mail (sign-up confirmation, password reset,
 * magic-link login, email-change confirmation) and support requests; every
 * notification, saved-search digest and trial/report alert is held. Turn it off
 * at launch to resume all mail. The flag lives in `app_settings`; the outbox
 * caches it ~30s, so a change takes effect within about half a minute.
 */
interface AppSettings {
	pause_nonessential_emails: boolean;
	updated_at: string;
}

export default function SystemSettingsPage() {
	const { data, mutate, isLoading, error } = useSWR<AppSettings>('/api/admin/app-settings');
	const [saving, setSaving] = useState(false);
	const paused = data?.pause_nonessential_emails ?? true;

	const setPaused = async (next: boolean) => {
		setSaving(true);
		try {
			const updated = await api<AppSettings>('PATCH', '/api/admin/app-settings', { pause_nonessential_emails: next });
			await mutate(updated, false);
			toast.success(next ? 'Non-essential emails paused' : 'Non-essential emails resumed');
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setSaving(false);
		}
	};

	return (
		<>
			<PageHeader kicker="System" title="System settings" subtitle="Global switches that take effect across the whole app." />
			<AsyncState loading={isLoading} error={error} onRetry={() => void mutate()}>
				<Section title="Email" meta="Pre-launch">

					<div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
						<div style={{ flex: 1, minWidth: 280 }}>
							<div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Pause non-essential emails</div>
							<p style={{ fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.55, margin: '6px 0 0', maxWidth: 560 }}>
								While this is on, the app sends <strong>only</strong> sign-up confirmation, password
								reset, magic-link login, email-change confirmation and support requests. All
								notifications, saved-search digests and trial / report alerts are held — use this
								before launch so test users stop receiving mail. Turn it off to resume everything.
							</p>
							{data && (
								<div style={{ fontSize: 11, color: 'var(--fg-muted)', fontFamily: 'var(--font-mono)', marginTop: 10 }}>
									{paused ? 'PAUSED' : 'ACTIVE'} · updated {new Date(data.updated_at).toLocaleString()}
								</div>
							)}
						</div>
						<button
							type="button"
							role="switch"
							aria-checked={paused}
							aria-label="Pause non-essential emails"
							disabled={saving}
							onClick={() => void setPaused(!paused)}
							style={{
								position: 'relative', width: 54, height: 30, flex: 'none', borderRadius: 999,
								border: '1px solid var(--border)', cursor: saving ? 'wait' : 'pointer',
								background: paused ? 'var(--accent, #e11d8f)' : 'var(--bg-2)',
								transition: 'background .15s', opacity: saving ? 0.6 : 1,
							}}
						>
							<span style={{
								position: 'absolute', top: 3, left: paused ? 27 : 3, width: 22, height: 22,
								borderRadius: '50%', background: '#fff', transition: 'left .15s',
								boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
							}} />
						</button>
					</div>
				</Section>
			</AsyncState>
		</>
	);
}
