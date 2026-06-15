'use client';

import { createContext, useCallback, useContext, useState } from 'react';
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
				<Modal title={state.opts.title ?? 'Please confirm'} onClose={() => close(false)} width={420} footer={
					<>
						<button className="btn ghost" onClick={() => close(false)}>Cancel</button>
						<button className="btn" style={state.opts.danger ? { color: 'var(--accent)' } : undefined} onClick={() => close(true)}>
							{state.opts.confirmLabel ?? 'Confirm'}
						</button>
					</>
				}>
					<div style={{ fontSize: 13, lineHeight: 1.5 }}>{state.opts.message}</div>
				</Modal>
			)}
		</ConfirmCtx.Provider>
	);
}
