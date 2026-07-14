# Contributing

Thanks for helping improve Coding Provider Manager (`cpm`).

## Setup (PowerShell)

```powershell
npm install
npm run check
```

Use Node.js 20+. `npm run check` runs `tsc --noEmit`, tests, and a production build.

## Workflow

1. Keep changes focused — prefer one logical concern per PR.
2. Do not commit secrets, vault material, or real API keys. Use env vars and the encrypted CPM vault.
3. Match existing TypeScript style: ESM, strict typing, `import type` for type-only imports.
4. Add or update tests under `test/` when behavior changes.
5. Update `README.md` and `docs/` when user-facing commands or contracts change.

## Useful scripts

| Script | Purpose |
|---|---|
| `npm run dev -- <args>` | Run CLI via `tsx` without building |
| `npm test` | Vitest |
| `npm run build` | Emit `dist/` |
| `npm run check` | Typecheck + test + build |

## Security

Never paste live credentials into issues, commits, or docs. Report suspected secret exposure privately to the maintainers and rotate the key.
