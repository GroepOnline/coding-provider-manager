# CLI reference (light)

Canonical help is always the binary:

```powershell
cpm --help
cpm <command> --help
```

This page is a map of top-level commands shipped in **0.4.x**, not an exhaustive flag list.

| Command | Purpose |
|---|---|
| `cpm` / `cpm tui` | OpenTUI control plane (TTY); non-TTY bare `cpm` → agent manifest |
| `cpm apps` / `cpm tools` | Coding surfaces, injection mode, auth flows |
| `cpm detect` | Detect installed tools |
| `cpm providers` | Provider profiles and active-key status |
| `cpm key` | Multi-key vault slots |
| `cpm switch` | One-shot key/account switch (`next` / `best` / alias) |
| `cpm accounts` | OAuth/account pools (`codex-multi-auth`, `oc-codex-multi-auth`, `github`) |
| `cpm auth` | Delegated browser/device/API-key login flows |
| `cpm usage` | Provider or account-pool usage/quota |
| `cpm models` | Fetch / list / select models |
| `cpm configure` | Interactive provider + tool selection |
| `cpm plan` / `cpm apply` | Preview and apply provider (+ optional resource) config |
| `cpm doctor` | Auth / model / optional capability probes |
| `cpm env` | Materialize active env files (`dotenv`, `powershell`, …) |
| `cpm secret` | Generic secrets for MCP/plugins/integrations |
| `cpm resource` | MCP / plugin / integration / graph registry |
| `cpm run` | Launch a coding CLI with injected active secrets |
| `cpm agent` | JSONL machine protocol (`manifest` / `call` / `serve`) |
| `cpm bundle` / `cpm sync` | Export/import and SSH push/pull |
| `cpm pi-zai` | Pi Z.AI extension helpers |
| `cpm status` | Local status overview |
| `cpm backups` / `cpm rollback` | Config backup list / restore |

Agent methods never return secret values — see [agent-protocol.md](agent-protocol.md). Adapter injection modes — see [adapter-capabilities.md](adapter-capabilities.md).
