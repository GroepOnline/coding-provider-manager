# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Provider Security Plane (PSP-007): `chefvault` and `cpm-local` secret backends, fleet-mode guard (no local vault fallback), desired-policy schema with opaque `chefvault://` refs, and `cpm policy plan|validate|apply|rollback|doctor` targeting OpenCodex.
- Docs: `docs/provider-security-plane.md` — ChefVault=secrets, CPM=desired policy, OpenCodex=runtime.
- Account driver `chefvault` — delegates OAuth/file account list/switch/status/usage to ChefGroep Vault (`chefvault`), the source of truth for Codex/Claude/Pi/Cursor/ocx profiles. CPM keeps the encrypted API-key vault.

### Changed

- Docs: `docs/accounts-and-usage.md` describes the chefvault / ocx / CPM split.

## [0.4.1] - 2026-07-14

### Added

- Tag-triggered GitHub Actions release workflow (`v*`) with check, `npm pack`, GitHub Release notes from CHANGELOG, and optional soft npm publish when `NPM_TOKEN` is present.
- GitHub Actions CI with Windows matrix, pack smoke, and ESLint lint gate.
- Expanded agent protocol methods for broader CLI parity (`cpm agent`).
- Guided Cursor/Windsurf adapter contracts and related capability docs.
- Windows ACL hardening, secure-mode path detection, and path guides.
- Extended usage adapters and doctor support matrix coverage.
- Vitest coverage config and CLI smoke tests.

### Fixed

- Post-parallel integration regressions in agent operations and CLI wiring.
- Windows path assertions and CPM state path documentation/ignores.

### Changed

- Hardened CLI DX helpers and usage fallback messaging for clearer operator feedback.

## [0.4.0] - 2026-07-14

First public 0.4 line of Coding Provider Manager (`cpm`): a local control plane for provider keys, OAuth account pools, usage, coding surfaces, MCP resources, and SSH sync.

### Added

- OpenTUI full-screen control plane via `cpm` / `cpm tui` (optional `@opentui/core`; snapshot mode for non-interactive checks).
- Stable JSONL agent protocol (`cpm agent manifest|call|serve`) that never prompts and never returns secret values.
- Multi-key encrypted vault (AES-256-GCM) with `cpm key`, `cpm switch`, and best/next selection where usage adapters exist.
- Saved OAuth/account pool drivers for `codex-multi-auth`, `oc-codex-multi-auth`, and GitHub CLI (`gh`), plus delegated login flows under `cpm auth`.
- Verified usage adapters for OpenRouter, DeepSeek, Z.AI Coding Plan, and Codex/OpenCode multi-auth account usage.
- Broad coding-surface catalog (automatic writers where a public config contract exists; guided/detected otherwise) — inspect with `cpm apps` / `cpm detect`.
- MCP / plugin / integration resource registry with renderers for major clients and `cpm resource apply`.
- SSH sync (`cpm sync push|pull`) with optional in-memory `--secrets` transport; headless installs via `CPM_MASTER_KEY`.
- Pi Z.AI helper commands (`cpm pi-zai`) integrating `@groeponline/pi-zai` metadata.
- Doctor, plan/apply, models fetch/select, backups/rollback, and `cpm run` session launchers.

### Security

- No secrets in usage cache, agent responses, TUI snapshots, `apps --json`, or normal sync bundles.
- Generated client configs prefer environment references over literal keys.
- Account-manager integrations use public CLIs; CPM does not ingest OAuth refresh tokens into the vault.

[Unreleased]: https://github.com/GroepOnline/coding-provider-manager/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/GroepOnline/coding-provider-manager/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/GroepOnline/coding-provider-manager/releases/tag/v0.4.0
