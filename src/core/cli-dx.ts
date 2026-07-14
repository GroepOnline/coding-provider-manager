import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { configRoot, cpmRoot, homeDir } from "./paths.js";
import { commandExists } from "./detect.js";

export interface RuntimePaths {
  home: string;
  configRoot: string;
  cpmRoot: string;
  platform: NodeJS.Platform;
  arch: string;
  node: string;
  appData?: string;
  localAppData?: string;
  shell?: string;
}

export interface DependencyStatus {
  bun: { available: boolean; path?: string; hint?: string };
  openTui: { available: boolean; hint?: string };
}

export function resolveRuntimePaths(home = homeDir()): RuntimePaths {
  const resolvedHome = path.resolve(home);
  return {
    home: resolvedHome,
    configRoot: path.resolve(configRoot(home)),
    cpmRoot: path.resolve(cpmRoot(home)),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    ...(process.env.APPDATA ? { appData: path.resolve(process.env.APPDATA) } : {}),
    ...(process.env.LOCALAPPDATA ? { localAppData: path.resolve(process.env.LOCALAPPDATA) } : {}),
    ...(process.env.ComSpec || process.env.SHELL
      ? { shell: process.env.ComSpec ?? process.env.SHELL }
      : {}),
  };
}

function bundledBunCandidate(): string | undefined {
  try {
    const require = createRequire(import.meta.url);
    const packageJson = require.resolve("bun/package.json");
    const binName = process.platform === "win32" ? "bun.exe" : "bun";
    const candidate = path.join(path.dirname(packageJson), "bin", binName);
    return fs.existsSync(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

export function resolveBunBinary(): { path?: string; available: boolean; hint?: string } {
  const explicit = process.env.CPM_BUN_BIN;
  if (explicit) {
    const resolved = path.resolve(explicit);
    if (fs.existsSync(resolved)) return { path: resolved, available: true };
    return {
      available: false,
      path: resolved,
      hint: `CPM_BUN_BIN points to a missing binary: ${resolved}`,
    };
  }
  const bundled = bundledBunCandidate();
  if (bundled) return { path: bundled, available: true };
  if (commandExists("bun")) return { path: "bun", available: true };
  return {
    available: false,
    hint: process.platform === "win32"
      ? "Install optional deps (`npm install` with optionalDependencies) or set CPM_BUN_BIN to bun.exe. On Windows, Bun is required for `cpm tui` when not running under Bun itself."
      : "Install optional deps (`npm install` with optionalDependencies) or set CPM_BUN_BIN / install bun on PATH.",
  };
}

export function resolveOpenTuiStatus(): { available: boolean; hint?: string } {
  try {
    const require = createRequire(import.meta.url);
    require.resolve("@opentui/core");
    return { available: true };
  } catch {
    return {
      available: false,
      hint: "OpenTUI (@opentui/core) is not installed. Reinstall CPM with optional dependencies enabled.",
    };
  }
}

export function inspectDependencies(): DependencyStatus {
  return {
    bun: resolveBunBinary(),
    openTui: resolveOpenTuiStatus(),
  };
}

/** Human-friendly CLI errors instead of raw Node stack/ErrnoException dumps. */
export function formatUserFacingError(error: unknown): string {
  const err = error as NodeJS.ErrnoException & { message?: string };
  const message = err?.message ?? String(error);
  const code = err?.code;

  if (code === "ENOENT") {
    const target = typeof err.path === "string" ? err.path : undefined;
    const lower = message.toLowerCase();
    if (target?.toLowerCase().includes("bun") || lower.includes("bun") || lower.includes("opentui")) {
      return [
        "Bun/OpenTUI runtime is unavailable.",
        "Reinstall CPM with optional dependencies enabled, or set CPM_BUN_BIN to a working Bun binary.",
        process.platform === "win32" ? "Windows tip: prefer an absolute path to bun.exe in CPM_BUN_BIN." : undefined,
        target ? `Missing: ${target}` : undefined,
      ].filter(Boolean).join(" ");
    }
    return target
      ? `Command or file not found: ${target}`
      : `Command or file not found. ${message}`;
  }

  if (/OpenTUI is not installed/i.test(message) || /Bun\/OpenTUI runtime is unavailable/i.test(message)) {
    return message;
  }

  if (/Cannot find module ['"]@opentui\/core['"]/i.test(message)) {
    return "OpenTUI is not installed. Reinstall CPM with optional dependencies enabled (`@opentui/core`).";
  }

  return message;
}

export const CLI_HELP_EXAMPLES = `
Examples:
  $ cpm configure
  $ cpm providers
  $ cpm key add zai-coding --from-env
  $ cpm plan --saved
  $ cpm apply --saved --yes
  $ cpm doctor zai-coding
  $ cpm status
  $ cpm tui
  $ cpm run opencode
  $ cpm env write --shell powershell
  $ cpm completion powershell | Out-File -Encoding utf8 $PROFILE.CurrentUserAllHosts -Append

Windows:
  Paths resolve under %APPDATA%\\coding-provider-manager (not ~/.config).
  Use PowerShell completion via: cpm completion powershell
`.trim();

export const COMMAND_HELP_GROUPS: Readonly<Record<string, string>> = {
  tui: "Interactive:",
  configure: "Setup:",
  providers: "Setup:",
  models: "Setup:",
  detect: "Setup:",
  apps: "Setup:",
  key: "Secrets:",
  secret: "Secrets:",
  env: "Secrets:",
  plan: "Apply:",
  apply: "Apply:",
  doctor: "Apply:",
  run: "Apply:",
  status: "Diagnostics:",
  backups: "Diagnostics:",
  rollback: "Diagnostics:",
  completion: "Diagnostics:",
  accounts: "Accounts & usage:",
  usage: "Accounts & usage:",
  switch: "Accounts & usage:",
  auth: "Accounts & usage:",
  resource: "Resources & sync:",
  bundle: "Resources & sync:",
  sync: "Resources & sync:",
  agent: "Agent:",
  "pi-zai": "Integrations:",
};

export function applyCommandHelpGroups(commands: ReadonlyArray<{ name: () => string; helpGroup: (heading: string) => unknown }>): void {
  for (const command of commands) {
    const group = COMMAND_HELP_GROUPS[command.name()];
    if (group) command.helpGroup(group);
  }
}

export function powershellCompletionScript(binName = "cpm"): string {
  const commands = Object.keys(COMMAND_HELP_GROUPS).sort();
  const list = commands.map((item) => `'${item}'`).join(", ");
  return `# CPM PowerShell completion (stub)
# Install: cpm completion powershell | Out-File -Encoding utf8 $PROFILE.CurrentUserAllHosts -Append
# Or dot-source in the current session after pasting.

Register-ArgumentCompleter -Native -CommandName ${binName} -ScriptBlock {
  param($wordToComplete, $commandAst, $cursorPosition)
  $commands = @(${list})
  $commands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {
    [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_)
  }
}
`;
}
