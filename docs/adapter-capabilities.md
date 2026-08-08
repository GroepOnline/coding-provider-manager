# Adapter capabilities

Matrix of coding-surface adapters registered in `src/adapters/index.ts`. Injection mode comes from each adapter’s `providerInjection` field, with the registry default of `automatic` when unset (`index.ts`). Guided and `none` entries are defined in `src/adapters/manual.ts`.

| Mode | Meaning |
|---|---|
| **automatic** | Dedicated writer plans config/env changes CPM can apply. |
| **guided** | Manual notes only — CPM does not patch app/extension secure storage. |
| **none** | Catalogued for detection / account guidance; no arbitrary-provider writer. |

## Automatic

| Tool ID | Display name | Source |
|---|---|---|
| `pi` | Pi + GroepOnline pi-zai | `pi.ts` (default) |
| `claude` | Claude Code | `claude.ts` (default) |
| `opencode` | OpenCode | `opencode.ts` (default) |
| `factory` | Factory Droid | `factory.ts` (default) |
| `aider` | Aider | `aider.ts` (default) |
| `continue` | Continue | `continue.ts` (default) |
| `kilo` | Kilo Code / Kilo CLI | `kilo.ts` (default) |
| `crush` | Crush | `crush.ts` (default) |
| `qwen-code` | Qwen Code | `qwen.ts` (`automatic`) |
| `codex` | Codex CLI | `codex.ts` (`automatic`) |
| `codex-app` | Codex desktop app | `codex.ts` (`automatic`) |
| `codex-ide` | Codex IDE extension | `codex.ts` (`automatic`) |

## Guided

| Tool ID | Display name |
|---|---|
| `cline` | Cline (path-aware guided — see Notes) |
| `roo` | Roo Code |
| `cursor` | Cursor (path-aware guided — see Notes) |
| `windsurf` | Windsurf (path-aware guided — see Notes) |
| `kimi-cli` | Kimi CLI |
| `goose` | Goose |
| `zed` | Zed |
| `trae` | TRAE |
| `sourcegraph-cody` | Sourcegraph Cody |
| `openhands` | OpenHands |
| `plandex` | Plandex |
| `mentat` | Mentat |
| `open-interpreter` | Open Interpreter |
| `mistral-vibe` | Mistral Vibe |
| `tabby` | Tabby |
| `void-editor` | Void Editor |
| `pearai` | PearAI |
| `qodo` | Qodo |
| `continue-cli` | Continue CLI |
| `aider-desk` | AiderDesk |

## None (no arbitrary-provider injection)

| Tool ID | Display name |
|---|---|
| `t3-chat` | T3 Chat |
| `antigravity` | Google Antigravity |
| `vscode` | Visual Studio Code |
| `github-copilot` | GitHub Copilot |
| `gemini-cli` | Gemini CLI |
| `amp` | Amp |
| `augment` | Augment Code |
| `junie` | JetBrains Junie |
| `replit-agent` | Replit Agent |
| `copilot-cli` | GitHub Copilot CLI |
| `amazon-q` | Amazon Q Developer CLI |
| `kiro` | Kiro |
| `warp` | Warp |
| `devin` | Devin |
| `sweep` | Sweep |
| `bolt` | Bolt |
| `lovable` | Lovable |

## Notes

- Codex CLI, desktop, and IDE share one host config path (`~/.codex/config.toml`); see [architecture.md](architecture.md).
- Higher-level provider contracts and MCP writers: [compatibility.md](compatibility.md).
- Cursor / Windsurf / Cline stay **guided** for provider keys (secure storage / account-owned Cascade). Plans now attach verified config paths and copy-pasteable model/baseURL/keyEnv notes for `plan`/`apply`. MCP for Cursor and Windsurf remains automatic via resource writers.
- Counts: 12 automatic, 20 guided, 17 none (49 adapters total).
