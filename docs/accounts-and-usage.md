# Accounts, keys and usage

API keys are CPM-owned encrypted slots. OAuth / file-based coding accounts are **not** duplicated here.

## Source of truth

| Concern | Owner |
|---------|--------|
| API keys (OpenRouter, Z.AI, …) | CPM encrypted vault (`vault.enc.json`) |
| OAuth / auth-file profiles (Codex, Claude, Pi, Cursor, ocx config) | **chefgroep-vault** (`chefvault`) |
| Runtime proxy + model routing | OpenCodex (`ocx`), pinned on host — see chefgroep-vault `PROVIDERS.md` |

Use `cpm key use|next|best` for API providers and `cpm accounts use|next` for account-backed clients.

## Drivers

| Driver | Command | Role |
|--------|---------|------|
| `chefvault` | `chefvault` | **Preferred** for ChefGroep hosts — list/switch/status/usage via vault account store; Codex switch also syncs ocx `__main__` |
| `codex-multi-auth` | `codex-multi-auth` | Optional external Codex pool tool |
| `opencode-codex-multi-auth` | `oc-codex-multi-auth` | Optional OpenCode Codex pool |
| `github` | `gh` | `gh auth switch` |

```bash
cpm accounts list chefvault
cpm accounts use chefvault Personal
cpm accounts status chefvault
```

Native provider usage is intentionally allowlisted. An unsupported provider produces an unavailable result instead of a fabricated balance.
