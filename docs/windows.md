# Windows notes

CPM is documented with **PowerShell** examples. Use native PowerShell or Windows Terminal — **WSL is not required**.

## State directory

On Windows, CPM stores vault, usage cache, plans, backups, and generated env files under:

```text
%APPDATA%\coding-provider-manager
```

Typical expanded path:

```text
C:\Users\<you>\AppData\Roaming\coding-provider-manager
```

Home resolution: `HOME`, then `USERPROFILE`, then the OS home. Config root prefers `APPDATA` when that home matches the process home.

On Linux/macOS the same tree lives under `~/.config/coding-provider-manager` (or `$XDG_CONFIG_HOME/coding-provider-manager`). There is **no** `~/.cpm` directory.

```powershell
cpm status
cpm doctor
```

## Install from source

```powershell
node --version   # Node 20+

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
- `--omit=optional` keeps non-interactive commands; TUI will fail.
- Fix: reinstall with optionals, or set `CPM_BUN_BIN` to a working Bun binary.
- Headless / CI: `cpm tui --snapshot` dumps the dashboard model without rendering.

Bare `cpm` opens the TUI only when stdin and stdout are terminals. Pipes, VS Code tasks, and non-TTY hosts get the agent manifest instead.

## OpenSSH sync

`cpm sync …` shells out to `ssh` on `PATH` (Windows optional feature **OpenSSH Client**).

```powershell
Get-Command ssh
# Settings → Apps → Optional features → OpenSSH Client, if missing

# ~/.ssh/config Host alias works the same as on Unix
cpm sync push bc-scan-arm
cpm sync push bc-scan-arm --apply
cpm sync push bc-scan-arm --secrets --apply
cpm sync pull bc-scan-arm
```

- Normal bundles exclude the encrypted vault and client-owned OAuth state.
- `--secrets` decrypts only in memory, sends values over SSH stdin, and re-encrypts with the remote master key.
- Remote must already have `cpm` (or pass `--remote-command`).
- For headless remotes, set a base64 32-byte `CPM_MASTER_KEY` on both sides when you need deterministic vault keys.

## GitHub CLI (`gh`) account pool

The `github` account driver uses the official GitHub CLI:

```powershell
Get-Command gh
winget install --id GitHub.cli   # if needed

cpm auth login github-cli
cpm accounts list github
cpm accounts use github github.com:<account>
cpm run copilot-cli --account github.com:<account>
```

CPM does not copy GitHub tokens into the vault; it drives `gh` for list/use/next/status.

## PowerShell environment write

Materialize active provider keys as a `.ps1` you can dot-source (contains plaintext secrets — treat like a password file):

```powershell
cpm env write --shell powershell
cpm env path --shell powershell
# → %APPDATA%\coding-provider-manager\env\active.ps1

. (cpm env path --shell powershell)
# or
. "$env:APPDATA\coding-provider-manager\env\active.ps1"
```

Lines look like `$env:OPENROUTER_API_KEY = '…'`. Prefer `cpm run <tool>` when you only need secrets for one child process. On Windows, NTFS ACLs on the CPM state folder replace Unix `0600`.

## Secrets and file modes

Unix installs `chmod` secret/env files to `0600`. On Windows, CPM runs `icacls` after secret writes (strip inheritance, grant current user only) — see [paths.md](paths.md). Master key creation fails closed if ACL lockdown fails; other atomic writes are best-effort so sandboxed hosts without `icacls` still function.

Prefer `CPM_MASTER_KEY` (base64-encoded 32-byte key) for deterministic headless/CI installs rather than committing a machine-local `master.key`.

## PowerShell tips

```powershell
# Single-quote JSON so braces are not expanded
cpm agent call keys.next --params '{"provider":"openrouter"}'

# Pipe secrets — avoid putting keys in shell history
$env:OPENROUTER_API_KEY | cpm key add openrouter primary
```

Multi-line MCP configs: use a here-string or a temp JSON file.

## Related docs

- [README](../README.md) — install, quick start, troubleshooting
- [paths.md](paths.md) — state directory, ACL behavior, detect path tokens
- [adapter-capabilities.md](adapter-capabilities.md) — automatic vs guided vs none
- [cli-reference.md](cli-reference.md) — command map (`cpm --help` is authoritative)
- [compatibility.md](compatibility.md) — provider / MCP matrix
- [agent-protocol.md](agent-protocol.md) — JSONL automation
