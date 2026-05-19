# Conventions

## Imports

- Use the `@/*` alias for everything in the admin tree: `@/lib/api`, `@/hooks/use-user-profile`, `@/components/atoms`. The alias maps to `./` (see [tsconfig.json](../tsconfig.json)).
- External libraries first, internal `@/*` second, relative `./` last.
- Group icon imports from `lucide-react` together on one line.

## File layout

```
app/
├── (admin)/         ← every authenticated admin page goes here
│   ├── layout.tsx   ← AdminShell wrapper (force-dynamic)
│   └── <route>/
│       └── page.tsx ← 'use client'
├── login/page.tsx
├── forbidden/page.tsx
├── layout.tsx       ← RootLayout (fonts, providers)
└── providers.tsx    ← SWRConfig, ThemeProvider, AuthSessionProvider, Toaster

components/
├── admin-shell.tsx  ← the gate + chrome
└── atoms.tsx        ← PageHeader, Empty, Tag, Chip, Section

hooks/
├── use-auth-session.tsx
└── use-user-profile.ts

lib/
├── api.ts           ← api() + swrFetcher() + buildUrl()
└── supabase.ts      ← getSupabaseBrowser()
```

## Naming

- Pages: lowercase folder names, `page.tsx` inside. Multi-word → kebab-case (`data-requests/page.tsx`, `startups-pipeline/page.tsx`).
- Hooks: `use-<thing>.ts(x)` — kebab-case file, camelCase export.
- Components: PascalCase export, kebab-case file. Atoms colocated in `components/atoms.tsx`.

## Data fetching

See [data-fetching.md](data-fetching.md) for the full pattern. The two-second version:

- Reads: `useSWR<T>(['/api/admin/foo', { page, q }])` — global fetcher handles the rest.
- Writes: `api('POST'|'PATCH'|'DELETE', url, body)` inside an async function with `useState` for the pending flag.
- Invalidations: `useSWRConfig().mutate((key) => Array.isArray(key) && key[0] === '/api/admin/foo')` to prefix-invalidate.

## Forms

- Raw `<input>` / `<select>` / `<textarea>` with `useState`. No react-hook-form.
- Submit handler is async + try/catch/finally. Toast on success and on error.
- Use the `search-input` class for inputs (it picks up the design-token style).

```tsx
const [name, setName] = useState('');
const [saving, setSaving] = useState(false);
const onSubmit = async () => {
  setSaving(true);
  try { await api('POST', '/api/admin/things', { name }); toast.success('Created'); }
  catch (e) { toast.error((e as Error).message); }
  finally { setSaving(false); }
};
```

## Styling

- Design-token CSS classes from [app/design-system.css](../app/design-system.css):
  - `btn`, `btn ghost` — buttons
  - `chip`, `chip on` — filter chips
  - `card` — bordered container
  - `tag`, `tag pos`, `tag neg`, `tag warn` — status pills
  - `data-table` — table with the SportsTechX style
  - `search-input` — text inputs
  - `filter-bar` — flex row above tables for filters
- CSS variables: `--font-display`, `--font-mono`, `--space-4`, `--space-5`, `--bg-2`, `--fg-muted`, `--accent`, `--border`. Use them; don't hardcode colors or spacing.
- Tailwind 4 utility classes are fine for layout (`flex`, `gap-3`, `min-h-screen`). Avoid Tailwind color utilities (`text-red-500`) — they bypass the design tokens.

## Atoms ([components/atoms.tsx](../components/atoms.tsx))

| Atom | Use for |
|---|---|
| `<PageHeader kicker title subtitle action />` | Standard h1 + uppercase kicker + optional subtitle / right-side button. Every page top. |
| `<Empty msg />` | "No claims found" placeholder inside tables. |
| `<Tag variant>` | Inline status pill. Variants: `''`, `'pos'`, `'neg'`, `'warn'`, `'pill'`. |
| `<Chip active count onClick>` | Filter chip. Used in filter-bar rows. |
| `<Section title meta action>` | Card with section head. Replaces ad-hoc card + header layouts. |

If something more complex is needed (Logo, Sparkline, WorldMap, Donut), it belongs in the user-facing client app, NOT here.

## Backend integration

- Talk to backend via `/api/*` paths. Next.js rewrites them to `BACKEND_URL` (see [next.config.ts](../next.config.ts)).
- The backend's `@RequireRole('admin')` guard reads `profiles.user_role`. Same source of truth as `useIsAdmin()` in the admin app.
- Backend errors surface as `Error("<status>: <text>")` from `api()` — toast the `.message` directly.
