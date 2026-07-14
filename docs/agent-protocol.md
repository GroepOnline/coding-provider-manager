# CPM agent protocol

CPM exposes a prompt-free newline-delimited JSON protocol.

```bash
cpm agent manifest
cpm agent serve
```

Request:

```json
{"id":1,"method":"keys.next","params":{"provider":"openrouter"}}
```

Response:

```json
{"id":1,"ok":true,"result":{"provider":"openrouter","activeKey":"backup"}}
```

Errors use stable codes:

```json
{"id":1,"ok":false,"error":{"code":"CPM_ERROR","message":"..."}}
```

`METHOD_NOT_FOUND` and `INVALID_JSON` are returned for protocol-level errors. Secret values are never returned. Supported methods are listed by `cpm agent manifest`.

## Methods

| Method | Params | Result |
|---|---|---|
| `system.status` | — | version, home, state, resource counts, detected tools, account drivers |
| `providers.list` | — | providers with preferences and model counts |
| `models.list` | `provider` | resolved model catalog for a provider |
| `apps.list` | — | detected coding-tool adapters |
| `resources.list` | — | managed MCP resources |
| `keys.list` | `provider` | key-slot summaries (alias/fingerprint only) |
| `keys.add` | `provider`, `value` **or** `fromEnv: true`; optional `alias` (default `default`), `inactive` | `{ provider, alias, active, fingerprint }` — raw key never returned |
| `keys.use` | `provider`, `alias` | `{ provider, activeKey }` |
| `keys.next` | `provider` | rotates active key slot |
| `keys.best` | `provider` | selects best key by usage score |
| `accounts.drivers` | — | account-driver summaries |
| `accounts.list` | `driver` | managed accounts |
| `accounts.use` | `driver`, `selector` | activates an account |
| `accounts.next` | `driver` | rotates to next account |
| `accounts.status` | `driver` | driver status |
| `usage.get` | `target`; optional `allKeys`, `alias` | usage results |
| `plan.preview` | optional `provider`, `tools`, `model`, `discover`, `makeDefault`, `saved` | per-provider plan summaries (`tool`, `status`, `path`, `notes`, `changed`) — no file bodies |
| `apply.execute` | same as plan + optional `resources` | applies ready plans with backups; non-interactive (no confirm) |
| `doctor.run` | optional `provider`, `model`, `alias`/`key`, `allKeys`, `probe` | auth (+ optional streaming/tool-call) probe results without secret values |
| `sync.status` | — | local sync readiness (state/resources/secret-scope counts). SSH pull/push stay CLI-only |

### `keys.add` security

Pass the secret only in `params.value` (or set the provider env var and pass `fromEnv: true`). Responses include a fingerprint only. Agents and logs must never echo `value`.

### `plan.preview` / `apply.execute`

Mirror `cpm plan` / `cpm apply --yes`. Plan summaries omit `before`/`after` bodies so config contents (and any accidental secrets) stay out of the protocol. `apply.execute` always applies without confirmation.
