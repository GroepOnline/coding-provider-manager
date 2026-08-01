# CPM architecture

## Provider Security Plane ownership

ChefVault owns secrets, CPM owns desired policy, OpenCodex owns runtime enforcement. See [provider-security-plane.md](./provider-security-plane.md) (PSP-007).

## Control-plane layers

CPM separates:

1. provider profiles and per-model wire protocols;
2. encrypted multi-key vault scopes;
3. coding-surface adapters;
4. delegated authentication flows;
5. managed resources such as MCP, plugin, integration and graph definitions;
6. bundle/SSH synchronization.

The separation permits key rotation without rewriting model definitions and permits OAuth without copying refresh tokens into CPM.

## Coding surfaces and shared hosts

A tool ID represents a user-visible surface, not necessarily an independent configuration store. The Codex family illustrates this:

```text
codex
codex-app
codex-ide
  └── sharedConfigGroup: codex-local-host
      └── ~/.codex/config.toml
```

Plans that target the same path are deduplicated when their output is identical. Conflicting output aborts before any write.

## Authentication boundary

API-key providers use named encrypted slots. OAuth/device flows use a separate catalog containing the owning executable and supported login/status/logout operations.

```text
CPM starts login → provider/client handles browser or device flow
                 → client stores and refreshes credentials
                 → CPM stores no OAuth refresh token
```

The exception is an explicitly user-supplied headless access token, such as Codex `--with-access-token`. CPM may store it as a generic encrypted secret and only pipes it to the client's stdin.

## Protocol routing

- `openai-chat` → Chat Completions clients
- `openai-responses` → Codex and Responses-aware OpenCode providers
- `anthropic-messages` → Claude/OpenCode/Qwen-compatible adapters

A provider can expose all three. Routing is selected per model, not merely per provider.

## Qwen Code adapter

Qwen Code's public `modelProviders` contract supports OpenAI-compatible and Anthropic entries with an `envKey`. CPM merges model entries into `~/.qwen/settings.json`, preserves unrelated configuration and excludes raw key values.

## MCP resource model

MCP resources retain transport, targets, static headers/settings and secret references. Renderers translate this model into each client's schema.

Codex uses `env_vars` for stdio secrets and supports remote bearer-token environment variables and OAuth metadata. Gemini/Qwen use environment expansion in their JSON settings. Cursor and Windsurf receive standard MCP JSON without touching provider credentials.

## Detection

Adapters can declare multiple commands and platform paths. Detection is advisory and never required to generate a plan, which is important for SSH sync into a host before the GUI or extension is installed.

## SSH sync

Normal bundles include state and resources only. CPM vault data is opt-in with `--secrets`. Client-owned OAuth state is never part of a bundle because CPM does not read it.

## Pi Z.AI boundary

Provider setup remains in CPM. Request normalization, thinking mapping, cache stability, runtime telemetry and local metrics remain in `@onlinechefgroep/pi-zai`.
