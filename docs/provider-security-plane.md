# Provider Security Plane (CPM)

CPM owns **desired policy** for provider pools targeting OpenCodex. It never persists or emits raw credentials in fleet mode.

## Ownership split

| Plane | Owner | Responsibility |
| --- | --- | --- |
| Secrets | **ChefVault** (`chefgroep-vault`, `:8323` provider-security) | Canonical credentials, leases, fencing, audit |
| Desired policy | **CPM** (`coding-provider-manager`) | Provider catalog, opaque refs, plan/validate/apply/rollback/doctor |
| Runtime | **OpenCodex** | Routing, in-memory credential slots, renewal, degraded mode |

See also: [Provider Security Plane plan](https://linear.app/groeponline/project/provider-security-plane-chefvault-cpm-opencodex-a20d88f3c106) (PSP-007).

## Secret backends

| Backend | Mode | Notes |
| --- | --- | --- |
| `cpm-local` | Standalone laptop / dev | Uses CPM encrypted vault (`vault.enc.json`); policy refs use `cpm-local://scope[:alias]` |
| `chefvault` | Fleet | Required when `fleetMode=true`; policy refs use opaque `chefvault://pool/slot` only |

**Fleet invariant:** when `fleetMode=true`, `secretBackend` must be `chefvault`. CPM refuses automatic fallback to the local encrypted vault or environment variables.

Configure in `~/.config/coding-provider-manager/provider-security/config.json`:

```json
{
  "schemaVersion": 1,
  "fleetMode": true,
  "secretBackend": "chefvault",
  "targetRuntime": "opencodex",
  "chefvaultUrl": "http://127.0.0.1:8323"
}
```

Environment override: `CHEF_PROVIDER_SECURITY_URL` (defaults to `http://127.0.0.1:8323`).

## Desired policy schema

Revisioned JSON written to:

- CPM archive: `~/.config/coding-provider-manager/provider-security/revisions/<revision>.json`
- OpenCodex consumer: `~/.config/opencodex/provider-policy.json`

Fleet policy pools expose limits only (`weight`, `rpm`, `concurrency`, `budgetUsd`, `fallbackCap`) plus opaque `credentialRef` values. Raw API keys, JWTs, and inline secret fields are rejected at validation time.

Example pool entry (fleet):

```json
{
  "providerId": "zai-coding",
  "weight": 100,
  "rpm": 60,
  "concurrency": 4,
  "budgetUsd": 50,
  "fallbackCap": 2,
  "credentialRef": "chefvault://pools/zai-coding/primary"
}
```

## CLI

```bash
cpm policy plan [--json]
cpm policy validate [--json]
cpm policy apply [--yes] [--json]
cpm policy rollback [revision]
cpm policy doctor [--json]
cpm policy config [--fleet | --no-fleet] [--backend chefvault|cpm-local] [--chefvault-url <url>] [--json]
```

`apply` writes revisioned policy JSON without raw secrets and records the active revision pointer. `rollback` restores the previous revision after validation.

## Standalone local vault

When `fleetMode=false` and `secretBackend=cpm-local`, existing `cpm key` / `cpm secret` commands continue to use the encrypted local vault unchanged. Provider-security policy ops are optional and complementary.
