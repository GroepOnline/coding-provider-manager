# OpenTUI control plane

`cpm` or `cpm tui` opens the full-screen TypeScript TUI when stdin/stdout are terminals. It uses `@opentui/core`, the same native terminal rendering core used by OpenCode.

The TUI is a view over the same core functions used by the normal CLI and JSONL agent server. It does not contain separate secret-management or configuration logic.

Use `cpm tui --snapshot` to inspect the dashboard model without terminal rendering. This is also used for automated validation.
