# `.claude/` Index

Documentation for Claude (and humans) working on the admin app. Read [CLAUDE.md](../CLAUDE.md) first — it has the entry-point routing.

## Files

| File | Use when… |
|---|---|
| [stack.md](stack.md) | You need to know what library handles X. |
| [architecture.md](architecture.md) | Adding a new top-level provider, changing the layout structure, or wondering why something renders before something else. |
| [rules.md](rules.md) | About to make any non-trivial change. The do-not-violate list. |
| [conventions.md](conventions.md) | Writing new code — naming, imports, styling, mutation shape. |
| [auth.md](auth.md) | Touching anything that depends on who's signed in, or wondering why an unauthenticated request gets 401. |
| [data-fetching.md](data-fetching.md) | Adding a `useSWR` or `api()` call. |
| [pages.md](pages.md) | "Where does X get edited?" — lookup table of every admin page. |

## Reading order for a fresh session

1. [stack.md](stack.md) (2 min) — orient
2. [architecture.md](architecture.md) (5 min) — provider tree, layout flow, edge proxy
3. [rules.md](rules.md) (3 min) — non-negotiables
4. relevant module: [auth.md](auth.md) / [data-fetching.md](data-fetching.md) / [pages.md](pages.md)

## What's deliberately NOT here

- **Per-page deep-dives.** Pages are mostly thin tables over backend endpoints; the per-page table in [pages.md](pages.md) is enough.
- **Skills folder.** The user-facing client has `skills/new-page/`, `skills/new-swr-query/`, etc. Admin pages are simpler — copying an existing tab page is faster than reading a recipe.
- **Component docs.** Two shared atoms ([components/atoms.tsx](../components/atoms.tsx)) and one shell ([components/admin-shell.tsx](../components/admin-shell.tsx)). Read them, don't document them.
