/**
 * SWR key factory for shared reference data, mirroring the client's
 * `client/lib/query-keys.ts` `reference.*` block. Keeping the keys centralized
 * means every picker that reads sectors/sports/etc. shares one cache slot.
 *
 * Keys are `[path, params?]` tuples consumed by `swrFetcher`/`buildUrl`
 * (see `lib/api.ts`).
 */
export const qk = {
	reference: {
		sports: (tree?: boolean) => (tree ? (['/api/sports', { tree: 'true' }] as const) : (['/api/sports'] as const)),
		sectors: (tree?: boolean) => (tree ? (['/api/sectors', { tree: 'true' }] as const) : (['/api/sectors'] as const)),
		techTags: () => ['/api/tech-tags'] as const,
		currencies: () => ['/api/currencies'] as const,
		roundTypes: () => ['/api/round-types'] as const,
		locationFacets: () => ['/api/locations/facets'] as const,
	},
} as const;
