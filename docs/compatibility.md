# Provider and coding-surface compatibility

## Provider injection

| Surface | Mode | Contract | Credential behavior |
|---|---:|---|---|
| Pi | Automatic for Z.AI | Pi native provider | Pi/environment resolution |
| Claude Code | Automatic | Anthropic Messages | runtime env + non-secret settings |
| OpenCode | Automatic | Chat, Responses, Anthropic | `{env:NAME}` and client-owned OAuth |
| Factory Droid | Automatic | Chat Completions | `${NAME}` |
| Kilo Code / CLI | Automatic | Chat Completions | `{env:NAME}` |
| Crush | Automatic | Chat Completions | required shell expansion |
| Aider | Automatic where policy permits | Chat Completions | runtime environment |
| Continue | Automatic where policy permits | Chat Completions | secret reference |
| Qwen Code | Automatic | Chat + Anthropic | `envKey` in `~/.qwen/settings.json` |
| Codex CLI | Automatic | Responses only | built-in auth or `env_key` |
| Codex desktop app | Automatic shared host config | Responses only | Codex-owned auth or OS/runtime env |
| Codex IDE extension | Automatic shared host config | Responses only | Codex-owned auth or IDE-host env |
| Cline / Roo | Guided (Cline path-aware) | app provider UI | extension secure storage |
| Cursor | Guided provider (path-aware); automatic MCP | app provider UI | Cursor secure storage |
| Windsurf | Guided provider (path-aware); automatic MCP | app provider UI | app secure storage |
| Goose / Zed / TRAE / Cody / Kimi CLI | Guided | target-specific | target-owned storage |
| Gemini CLI | No arbitrary provider injection; automatic MCP | Google GenAI / Vertex | Google OAuth, API key or ADC |
| GitHub Copilot | Account-owned | GitHub entitlement | GitHub device/browser auth |
| T3 Chat / Antigravity / Amp / Augment / Junie / Replit | Catalogued, no writer | no verified generic BYOK contract | account-owned |

`AGY` is interpreted as Google Antigravity. `T3 app` is interpreted as T3 Chat. These aliases are documented assumptions rather than claims about private APIs.

## OAuth/delegated flows

| Flow | Owner | Method |
|---|---|---|
| `codex-chatgpt` | Codex | browser OAuth |
| `codex-openai-key` | Codex | selected CPM OpenAI key piped over stdin |
| `codex-access-token` | Codex | selected generic secret piped over stdin |
| `opencode-openai-chatgpt` | OpenCode | provider login/browser selection |
| `opencode-github-copilot` | OpenCode/GitHub | device login |
| `opencode-gitlab-duo` | OpenCode/GitLab | device login |
| `gemini-google` | Gemini CLI/Google | browser OAuth |
| `gemini-vertex-adc` | Google Cloud CLI | application-default credentials |
| `github-cli` | GitHub CLI | device/browser auth |

CPM starts these flows and can run status/logout commands. It does not ingest the resulting refresh tokens into its vault.

## MCP writers

| Target | Config |
|---|---|
| OpenCode | global `opencode.json` `mcp` |
| Kilo | global `kilo.jsonc` `mcp` |
| Claude Code | `~/.claude.json` `mcpServers` |
| Factory | `~/.factory/mcp.json` |
| Codex CLI/app/IDE | shared `~/.codex/config.toml` `mcp_servers` |
| Cursor | `~/.cursor/mcp.json` |
| Windsurf | `~/.codeium/windsurf/mcp_config.json` |
| Gemini CLI | `~/.gemini/settings.json` `mcpServers` |
| Qwen Code | `~/.qwen/settings.json` `mcpServers` |

Remote MCP OAuth is delegated with `cpm resource auth` to Codex or OpenCode. Tokens remain in the corresponding client store.

## Core invariants

1. Literal secrets are excluded from generated configs where a reference contract exists.
2. CPM never patches proprietary application databases or credential stores.
3. Shared Codex surfaces resolve to one transaction path.
4. Responses, Chat Completions and Anthropic Messages are separate contracts.
5. Account-subscription OAuth is not repurposed in tools where the provider forbids it.
6. Model discovery, authentication, streaming and tool-call probes are independent checks.
7. Normal SSH bundles exclude both CPM vault values and client-owned OAuth credentials.
