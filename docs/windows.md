# Windows notes

CPM is developed and documented primarily with **PowerShell** examples. This page covers Windows-specific paths, install quirks, and common failure modes. Use native PowerShell or Windows Terminal — **WSL is not required**.

## State directory

On Windows, CPM stores vault, usage cache, plans, backups, and generated env files under:

```text
%APPDATA%\coding-provider-manager
```

Typical expanded path:

```text
C:\Users\<you>\AppData\Roaming\coding-provider-manager
```

Resolution order for the home directory is `HOME`, then `USERPROFILE`, then the OS home. Config root prefers `APPDATA` when that home matches the process home.

On Linux/macOS the same tree lives under `~/.config/coding-provider-manager` (or `$XDG_CONFIG_HOME/coding-provider-manager`).

Inspect status without digging through files:

```powershell
cpm status
cpm doctor
```

## Install from source

```powershell
# Node 20+ on PATH
node --version

cd <repo-root>
npm install
npm run check
npm link
cpm --version
```

Without a global link:

```powershell
npm run build
node .\dist\cli.js --version
npm start -- --version
```

Packed smoke test:

```powershell
npm pack
npm install -g .\onlinechefgroep-coding-provider-manager-0.4.0.tgz
cpm --version
```

## OpenTUI / interactive dashboard

`cpm` and `cpm tui` need optional dependency `@opentui/core` (and its Bun-backed runner when required).

- Install **with** optional dependencies (default `npm install`).
- If you used `--omit=optional` or a lockfile that dropped optionals, non-interactive commands still work; TUI will not.
- Fix: reinstall with optionals enabled, or set `CPM_BUN_BIN` to a working Bun binary if the runner cannot locate one.
- For CI or headless checks without a real TTY: `cpm tui --snapshot`.

Bare `cpm` only opens the TUI when both stdin and stdout are terminals. In pipes, VS Code tasks, or non-TTY hosts it prints the agent manifest instead.

## SSH sync

`cpm sync …` expects an `ssh` client on `PATH` (OpenSSH Client optional feature on Windows 10/11).

```powershell
Get-Command ssh
cpm sync push <host-alias>
```

Enable **OpenSSH Client** under *Settings → Apps → Optional features* if `ssh` is missing. Agent forwarding and remote shell quirks are outside CPM — treat sync like any other SSH-based tool.

## Secrets and file modes

Unix installs chmod secret/env files to `0600`. Windows has no equivalent POSIX mode; protect the CPM state folder with NTFS ACLs and your Windows user account instead. Prefer `CPM_MASTER_KEY` (base64-encoded 32-byte key) for deterministic headless/CI installs rather than relying on a machine-local master key file when sharing images or profiles.

## PowerShell tips

- Pass JSON params with single-quoted strings so PowerShell does not expand braces:

  ```powershell
  cpm agent call keys.next --params '{"provider":"openrouter"}'
  ```

- Pipe secrets from the environment, not from shell history:

  ```powershell
  $env:OPENROUTER_API_KEY | cpm key add openrouter primary
  ```

- Multi-line remote MCP configs: use a here-string or a temp JSON file rather than nested escaping.

## Related docs

- [README](../README.md) — install, quick start, command overview
- [compatibility.md](compatibility.md) — provider and surface matrix
- [agent-protocol.md](agent-protocol.md) — JSONL automation
