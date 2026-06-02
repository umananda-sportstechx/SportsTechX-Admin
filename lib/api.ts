'use client';

import { getSupabaseBrowser } from './supabase';

/**
 * Thin fetch wrapper with Supabase auth.
 *
 * Paths are intentionally relative (e.g. `/api/admin/claims`). Next.js's
 * rewrite in `next.config.ts` forwards `/api/*` to the NestJS server at
 * `BACKEND_URL` (defaults to `http://localhost:5000`). Same-origin requests
 * also avoid CORS preflight overhead in dev. Absolute URLs are still
 * supported for the rare case of cross-host requests.
 */
/** Error carrying the HTTP status so callers / SWR onError can branch on 401. */
export class ApiError extends Error {
	constructor(public readonly status: number, message: string) {
		super(message);
		this.name = 'ApiError';
	}
}

async function getAuthHeader(forceRefresh = false): Promise<Record<string, string>> {
	const supabase = getSupabaseBrowser();
	if (forceRefresh) {
		// Hard refresh the access token using the stored refresh token.
		const { data } = await supabase.auth.refreshSession();
		return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : {};
	}
	const { data: { session } } = await supabase.auth.getSession();
	return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

/** Redirect to the login page, preserving where we came from. */
function redirectToLogin(): void {
	if (typeof window === 'undefined') return;
	if (window.location.pathname === '/login') return;
	window.location.assign('/login');
}

async function doFetch(method: string, url: string, body: unknown, forceRefresh: boolean): Promise<Response> {
	const auth = await getAuthHeader(forceRefresh);
	return fetch(url, {
		method,
		headers: {
			...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
			...auth,
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
	});
}

export async function api<T = unknown>(
	method: string,
	path: string,
	body?: unknown,
): Promise<T> {
	const url = path.startsWith('http')
		? path
		: path.startsWith('/') ? path : `/${path}`;
	let res = await doFetch(method, url, body, false);

	// Session likely expired — try one hard token refresh and retry. If still
	// unauthorized, the refresh token is dead too: bounce to /login.
	if (res.status === 401) {
		res = await doFetch(method, url, body, true);
		if (res.status === 401) {
			redirectToLogin();
			throw new ApiError(401, 'Session expired — please sign in again.');
		}
	}

	if (!res.ok) {
		const text = await res.text().catch(() => res.statusText);
		throw new ApiError(res.status, `${res.status} ${res.statusText}: ${text}`);
	}
	const ct = res.headers.get('content-type') ?? '';
	if (ct.includes('application/json')) return (await res.json()) as T;
	return undefined as T;
}

/**
 * Build a URL from an SWR-style key tuple `[path, params?]`. Mirrors the
 * client's `buildUrl` so both apps share the same key→URL convention.
 */
function buildUrl(queryKey: readonly unknown[]): string {
	const [path, params] = queryKey as [string, Record<string, unknown> | undefined];
	if (!params || typeof params !== 'object') return path;
	const sp = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		if (v == null || v === '') continue;
		if (Array.isArray(v)) {
			for (const item of v) sp.append(k, String(item));
		} else {
			sp.set(k, String(v));
		}
	}
	const qs = sp.toString();
	if (!qs) return path;
	return `${path}${path.includes('?') ? '&' : '?'}${qs}`;
}

/**
 * Global SWR fetcher. Accepts either a string URL or a key tuple `[path, params?]`.
 * Tuple form is preferred so that two queries with different params land in
 * different cache slots — same convention as `qk.*` on the user-facing client.
 */
export async function swrFetcher<T = unknown>(key: string | readonly unknown[]): Promise<T> {
	const url = Array.isArray(key) ? buildUrl(key) : (key as string);
	return api<T>('GET', url);
}
