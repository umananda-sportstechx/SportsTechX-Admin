'use client';

import { createContext, useCallback, useContext, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './modal';

interface ConfirmOpts { title?: string; message: string; confirmLabel?: string; danger?: boolean }
type ConfirmFn = (arg: ConfirmOpts | string) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn>(async () => false);

/** Returns an async `confirm(message | opts)` that resolves true/false. */
export function useConfirm(): ConfirmFn {
	return useContext(ConfirmCtx);
}

/**
 * App-level styled confirmation dialog. Replaces the browser's native
 * `confirm()` with a themed modal. Usage:
 *   const confirm = useConfirm();
 *   if (!(await confirm('Delete this?'))) return;
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
	const [state, setState] = useState<{ opts: ConfirmOpts; resolve: (ok: boolean) => void } | null>(null);

	const confirm = useCallback<ConfirmFn>((arg) => {
		const opts = typeof arg === 'string' ? { message: arg } : arg;
		return new Promise<boolean>((resolve) => setState({ opts, resolve }));
	}, []);

	const close = (ok: boolean) => { state?.resolve(ok); setState(null); };

	return (
		<ConfirmCtx.Provider value={confirm}>
			{children}
			{state && (
				<Modal title={state.opts.title ?? 'Please confirm'} onClose={() => close(false)} width={430} footer={
					<>
						<button className="btn ghost" onClick={() => close(false)}>Cancel</button>
						<button
							className="btn"
							autoFocus
							style={state.opts.danger ? { background: 'var(--neg)', borderColor: 'var(--neg)', color: '#fff' } : undefined}
							onClick={() => close(true)}
						>
							{state.opts.confirmLabel ?? 'Confirm'}
						</button>
					</>
				}>
					<div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
						{state.opts.danger && (
							<div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb, var(--neg) 14%, transparent)', color: 'var(--neg)' }}>
								<AlertTriangle size={17} />
							</div>
						)}
						<div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--fg-2)', paddingTop: state.opts.danger ? 4 : 0 }}>{state.opts.message}</div>
					</div>
				</Modal>
			)}
		</ConfirmCtx.Provider>
	);
}
