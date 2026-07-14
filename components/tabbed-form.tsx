'use client';

import { useState } from 'react';

/**
 * Tab strip for the rich entity modals. Render this as the `children` of
 * `<Modal>`; keep all form state in the parent (one `useState` per field, or an
 * immutable form object) so switching tabs never loses input — only the active
 * tab's node is mounted, but the data lives outside it.
 *
 * The parent owns the single Save button (pass it as `Modal`'s `footer`), so an
 * admin can save from any tab. Tabs are purely presentational here.
 *
 * Usage:
 *   const [tab, setTab] = useTabs('profile');
 *   <Modal footer={<SaveBtn/>}>
 *     <TabbedForm active={tab} onChange={setTab} tabs={[
 *       { key: 'profile', label: 'Profile', node: <…/> },
 *       { key: 'class', label: 'Classification', node: <…/>, hint: 3 },
 *     ]} />
 *   </Modal>
 */

export interface FormTab {
	key: string;
	label: string;
	node: React.ReactNode;
	/** Optional count badge (e.g. number of selected relations) shown on the tab. */
	hint?: number;
}

export function useTabs(initial: string): [string, (k: string) => void] {
	const [tab, setTab] = useState(initial);
	return [tab, setTab];
}

export function TabbedForm({
	tabs, active, onChange,
}: {
	tabs: FormTab[];
	active: string;
	onChange: (key: string) => void;
}) {
	const current = tabs.find((t) => t.key === active) ?? tabs[0];
	return (
		<div style={{ display: 'grid', gap: 18 }}>
			<div
				role="tablist"
				style={{
					display: 'flex', gap: 2, flexWrap: 'wrap',
					borderBottom: '1px solid var(--border)',
				}}
			>
				{tabs.map((t) => {
					const on = t.key === active;
					return (
						<button
							key={t.key}
							type="button"
							role="tab"
							aria-selected={on}
							onClick={() => onChange(t.key)}
							style={{
								display: 'inline-flex', alignItems: 'center', gap: 6,
								padding: '9px 14px', marginBottom: -1, fontSize: 13,
								fontWeight: on ? 600 : 500,
								color: on ? 'var(--fg)' : 'var(--fg-muted)',
								background: 'transparent', border: 0,
								borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
								cursor: 'pointer', transition: 'color .15s',
							}}
						>
							{t.label}
							{t.hint != null && t.hint > 0 && (
								<span style={{
									fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1,
									padding: '2px 5px', borderRadius: 999,
									background: on ? 'var(--accent-soft, var(--bg-3))' : 'var(--bg-3)',
									color: on ? 'var(--accent)' : 'var(--fg-muted)',
								}}>{t.hint}</span>
							)}
						</button>
					);
				})}
			</div>
			<div role="tabpanel" style={{ display: 'grid', gap: 12 }}>
				{current?.node}
			</div>
		</div>
	);
}

/** Labelled field wrapper matching the existing admin form style. */
export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
	return (
		<div>
			<div className="co-stat-label" style={{ marginBottom: 6 }}>
				{label}
				{hint && <span style={{ color: 'var(--fg-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}> · {hint}</span>}
			</div>
			{children}
		</div>
	);
}
