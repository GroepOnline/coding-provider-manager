# Coding Provider Manager

`cpm` is an interactive and agent-native local control plane for coding-model providers, API-key pools, OAuth account pools, usage/quota, coding tools, MCP servers, plugins, integrations, and SSH synchronization.

Version **0.4** adds a full OpenTUI dashboard, a stable JSONL agent protocol, provider usage adapters, multi-account drivers, and 49 coding surfaces.

| | |
|---|---|
| Package | `@onlinechefgroep/coding-provider-manager` |
| CLI | `cpm` |
| License | [MIT](LICENSE) |
| Node | **20+** |

## Requirements

- **Node.js 20 or newer** (`node --version`)
- Optional: **[@opentui/core](https://www.npmjs.com/package/@opentui/core)** for `cpm` / `cpm tui` (listed as an optional dependency)
- Optional account managers for OAuth pools: `codex-multi-auth`, `oc-codex-multi-auth`, and/or GitHub CLI (`gh`)
- SSH client available on `PATH` for `cpm sync …`

Local state lives under the platform config root (usage cache, vault, plans):

| OS | Path |
|---|---|
| Windows | `%APPDATA%\coding-provider-manager` |
| Linux / macOS | `~/.config/coding-provider-manager` (or `$XDG_CONFIG_HOME/…`) |

Secrets are never written to the usage cache. Windows path details: [docs/windows.md](docs/windows.md).

## Installation

### From source (Windows PowerShell)

Requires **Node.js 20+** on `PATH`. From the repository root (native PowerShell — WSL not required):

```powershell
node --version
npm install
npm run check
npm link
cpm --version
```

Quick local run without a global link:

```powershell
npm install
npm run build
npm start -- --version
# or
node .\dist\cli.js --version
```

Dev mode (TypeScript via `tsx`, no build step):

```powershell
npm install
npm run dev -- --version
npm run dev -- agent manifest
```

If `npm link` fails with an EPERM / path-length error, prefer `node .\dist\cli.js …` or install from a packed tarball (below). See [docs/windows.md](docs/windows.md) for OpenTUI, SSH, and `%APPDATA%` notes.

### From a packed tarball

```powershell
npm pack
npm install -g .\onlinechefgroep-coding-provider-manager-0.4.0.tgz
cpm --version
```

OpenTUI is optional. Package managers that omit optional dependencies keep every non-interactive command, but cannot launch `cpm tui`.

### Uninstall

```powershell
npm unlink -g @onlinechefgroep/coding-provider-manager
# or, if installed from a tarball:
npm uninstall -g @onlinechefgroep/coding-provider-manager
```

## Quick start

Five-minute path after install:

1. Confirm the binary: `cpm --version`
2. Add a key (example OpenRouter): `$env:OPENROUTER_API_KEY | cpm key add openrouter primary`
3. Check health: `cpm doctor openrouter` (add `--probe` for live capability checks)
4. Open the dashboard (TTY) or query the agent API (non-TTY)

Human terminal (TTY):

```powershell
cpm
# or
cpm tui
```

When stdout and stdin are terminals, `cpm` with no arguments opens the OpenTUI control plane. Hotkeys:

```text
←/→ or h/l   change view
j/k          move selection
n or Enter   next API key / next saved account
b            choose the key with the best verified remaining quota
r            refresh usage
q            quit
```

Automation and agents (never prompts; never returns secret values). Quote JSON with single quotes in PowerShell so braces are not expanded:

```powershell
cpm agent manifest
cpm agent call providers.list
cpm agent call keys.next --params '{"provider":"openrouter"}'
'{"id":1,"method":"system.status"}' | cpm agent serve
```

In a non-TTY environment, bare `cpm` prints the machine manifest instead of starting a UI.

## Providers

| ID | Credential | Supported protocols |
|---|---|---|
| `zai-coding` | `ZAI_API_KEY` | Chat Completions, Anthropic Messages |
| `minimax` | `MINIMAX_API_KEY` | Chat Completions, Anthropic Messages |
| `opencode-zen` | `OPENCODE_ZEN_API_KEY` | Responses, Chat Completions, Anthropic Messages |
| `opencode-go` | `OPENCODE_GO_API_KEY` | Chat Completions, Anthropic Messages |
| `kilo-gateway` | `KILO_API_KEY` | Chat Completions |
| `cline-pass` | `CLINE_API_KEY` | Chat Completions |
| `openrouter` | `OPENROUTER_API_KEY` | Chat Completions |
| `deepseek` | `DEEPSEEK_API_KEY` | Chat Completions |
| `openai` | `OPENAI_API_KEY` or client-owned OAuth | Responses |

ClinePass is the external Cline API at `https://api.cline.bot/api/v1`, not Cline's private extension OAuth state.

## Multi-key API pools

Each provider can have multiple encrypted key aliases:

```powershell
$env:OPENROUTER_API_KEY | cpm key add openrouter primary
$env:OPENROUTER_BACKUP_KEY | cpm key add openrouter backup --inactive

cpm key list openrouter
cpm key use openrouter backup
cpm key next openrouter
cpm key best openrouter
```

One-command switching:

```powershell
cpm switch openrouter primary
cpm switch openrouter next
cpm switch openrouter best
```

`best` is enabled only where CPM has a verified usage/balance adapter. Vault contents use AES-256-GCM. Generated client configurations contain environment references, not literal provider keys.

## Saved OAuth / account pools

CPM integrates with specialized account managers rather than copying or rewriting their OAuth tokens:

| Driver | Underlying tool | Operations |
|---|---|---|
| `codex-multi-auth` | `codex-multi-auth` | list, use, next, status, usage |
| `opencode-codex-multi-auth` | `oc-codex-multi-auth` | list, use, next, status, usage |
| `github` | official `gh` CLI | list, use, next, status |

```powershell
cpm accounts install codex-multi-auth
cpm accounts install opencode-codex-multi-auth

cpm accounts list codex-multi-auth
cpm accounts use codex-multi-auth work@example.com
cpm accounts next codex-multi-auth

cpm accounts list github
cpm accounts use github github.com:OnlineChef
```

Launch a tool with a selected account for one session:

```powershell
cpm run codex --account work@example.com
cpm run opencode --account 2
cpm run copilot-cli --account github.com:OnlineChef
```

OAuth login is only for initially adding or repairing an account:

```powershell
cpm auth login codex-chatgpt
cpm auth login opencode-openai-chatgpt
cpm auth login opencode-github-copilot
cpm auth login gemini-google
cpm auth login github-cli
```

## Usage and quota

```powershell
cpm usage all
cpm usage openrouter --all-keys
cpm usage deepseek --all-keys
cpm usage zai-coding --all-keys
cpm accounts usage codex-multi-auth
cpm accounts usage opencode-codex-multi-auth
```

Native verified adapters currently exist for OpenRouter, DeepSeek, Z.AI Coding Plan, and Codex/OpenCode account usage through their multi-auth managers. Providers without a documented account-usage endpoint return a structured `available: false` result — CPM does not invent balances.

## Coding surfaces

Direct automatic provider adapters:

```text
Pi, Claude Code, OpenCode, Factory Droid, Aider, Continue,
Kilo, Crush, Qwen Code, Codex CLI, Codex app, Codex IDE
```

Guided/detected surfaces include Cline, Roo Code, Cursor, Windsurf, Gemini CLI, GitHub Copilot, Copilot CLI, and many others. Inspect the matrix:

```powershell
cpm apps
cpm apps --json
cpm detect
```

CPM only writes an application automatically when a stable public configuration contract is available. It does not patch proprietary SQLite databases, browser state, extension global-state blobs, or OS credential stores.

## Models and provider configuration

```powershell
cpm models fetch all
cpm models list openrouter
cpm models select minimax
cpm configure

cpm plan --saved
cpm apply --saved --resources
cpm doctor openrouter --probe
```

OpenCode Zen/Go are protocol-routed per model. Responses models are only emitted to Responses-capable clients; Anthropic and Chat Completions models stay on matching transports.

## MCP and other resources

The common registry manages `mcp | plugin | integration | graph`. Automatic MCP renderers exist for OpenCode, Kilo, Claude Code, Factory, Codex, Cursor, Windsurf, Gemini CLI, and Qwen Code.

```powershell
cpm resource add mcp company-api `
  --config '{"type":"remote","url":"https://example.com/mcp","oauthClientId":"public-client"}' `
  --targets codex,opencode,cursor,gemini-cli

cpm resource apply --yes
cpm resource auth company-api --tool codex
```

Client-owned MCP OAuth tokens remain in the client that performed the login.

## SSH and headless operation

```powershell
cpm sync push bc-scan-arm
cpm sync push bc-scan-arm --apply
cpm sync push bc-scan-arm --secrets --apply
cpm sync pull bc-scan-arm
```

Normal bundles exclude the encrypted vault and all client-owned OAuth state. `--secrets` decrypts values only in memory, transports them through SSH stdin, and re-encrypts them with the destination's CPM master key.

For deterministic headless installs, supply a base64-encoded 32-byte `CPM_MASTER_KEY`.

## Pi Z.AI integration

```powershell
cpm pi-zai install
cpm pi-zai info
```

CPM reuses verified model and thinking metadata from `@onlinechefgroep/pi-zai`. The extension remains responsible for Z.AI request normalization, cache intelligence, session affinity, quota diagnostics, and privacy-first local metrics.

## Security properties

- AES-256-GCM vault with named key slots
- Linux/macOS secret and generated environment files use mode `0600`
- Atomic writes, backups, and rollback for client configuration
- No secrets in `apps --json`, TUI snapshots, usage cache, agent responses, or normal sync bundles
- Subprocesses launch without shell interpolation
- Account-manager integrations use their public CLIs rather than token-file mutation

## Troubleshooting

| Symptom | What to try |
|---|---|
| `cpm` / `cpm tui` fails with OpenTUI / Bun unavailable | Reinstall with optional deps enabled (`npm install` without `--omit=optional`). Or set `CPM_BUN_BIN`. Use `cpm tui --snapshot` when you only need the model dump. |
| Bare `cpm` prints JSON instead of a UI | Non-TTY host (pipe, task, CI). Run in Windows Terminal / an interactive PowerShell, or call `cpm tui` explicitly. |
| `ssh` / `cpm sync` not found | Install Windows OpenSSH Client; confirm `Get-Command ssh`. See [docs/windows.md](docs/windows.md). |
| `usage` returns `available: false` | Expected when no verified adapter exists for that provider. CPM does not invent balances. |
| Doctor auth failures | Confirm the active key with `cpm key list <provider>` / `cpm key use …`, then `cpm doctor <provider> --probe`. |
| PowerShell mangles `--params '{…}'` | Use **single-quoted** JSON strings so `{` / `}` are not expanded. |
| Cannot find vault / state after install | On Windows look under `%APPDATA%\coding-provider-manager`, not `~/.cpm`. |
| Global link / install EPERM | Use `node .\dist\cli.js` or a tarball install; close processes locking `node_modules`. |

Still stuck: `cpm status`, `cpm doctor`, and `cpm agent manifest` are the safest read-only diagnostics (no secret values in agent output).

## Further documentation

| Doc | Topic |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | Release history (Keep a Changelog) |
| [docs/windows.md](docs/windows.md) | Windows paths, OpenTUI, SSH, PowerShell tips |
| [docs/architecture.md](docs/architecture.md) | Control-plane layers, auth boundary, protocol routing, SSH |
| [docs/compatibility.md](docs/compatibility.md) | Provider injection matrix, OAuth flows, MCP writers |
| [docs/agent-protocol.md](docs/agent-protocol.md) | JSONL agent protocol |
| [docs/accounts-and-usage.md](docs/accounts-and-usage.md) | Key vs account ownership and usage allowlist |
| [docs/tui.md](docs/tui.md) | OpenTUI control plane notes |

## Development

```powershell
npm install
npm run check   # tsc --noEmit && vitest && build
npm test
npm run build
npm pack
npm audit
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for a short contributor checklist.

## License

[MIT](LICENSE) © OnlineChefGroep
