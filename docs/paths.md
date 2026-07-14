# CPM state and detection paths

Canonical locations for CPM state and desktop-tool detection. Prefer this page over legacy `~/.cpm` references — that path is **not** used by coding-provider-manager.

## State directory

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\coding-provider-manager` (typically `C:\Users\<you>\AppData\Roaming\coding-provider-manager`) |
| macOS / Linux | `~/.config/coding-provider-manager` or `$XDG_CONFIG_HOME/coding-provider-manager` |

Resolved by `src/core/paths.ts` (`cpmRoot`). Contents include `vault.enc.json`, optional `master.key`, `env/`, usage/model caches, plans, and backups.

Inspect without digging:

```powershell
cpm status
cpm doctor
```

## Secret file permissions

| Platform | Behavior |
|---|---|
| POSIX | Files written via `atomicWrite` / vault use mode `0600` (`chmod`). |
| Windows | `icacls` strips inheritance and grants Full control to the current user only (`src/core/secure-mode.ts`). Master key creation is **fail-closed**; other atomic writes are **best-effort** so missing `icacls` in sandboxes does not brick I/O. |

Prefer `CPM_MASTER_KEY` (base64 32-byte key) for headless/CI when you need a deterministic vault key.

## Desktop detect paths (Windows)

Adapter `detect.paths` may include:

- `%LOCALAPPDATA%\Programs\…` — per-user Electron/VS Code-style installs
- `%ProgramFiles%\…` / `%ProgramFiles(x86)%\…` — machine-wide installs
- macOS `/Applications/….app` entries (ignored on Windows when missing)

Expansion of `~` and `%VAR%` happens in `src/core/detect.ts` (`expandDetectPath`). High-value desktop apps with Windows candidates include Cursor, VS Code, Windsurf, Antigravity, Zed, Warp, Void, PearAI, Kiro, and AiderDesk.

## Related

- [windows.md](windows.md) — PowerShell install, OpenTUI, SSH, env write
- [README](../README.md) — quick start and troubleshooting table
