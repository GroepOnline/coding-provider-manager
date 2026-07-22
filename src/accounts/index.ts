import type { AccountDriverId, AccountDriverSummary, ManagedAccount, UsageResult } from "../types.js";
import { commandExists } from "../core/detect.js";
import { parseJsonOutput, runCaptured, type ExecResult } from "../core/exec.js";

interface AccountDriver {
  id: AccountDriverId;
  displayName: string;
  command: string;
  supportsUsage: boolean;
  list(): Promise<ManagedAccount[]>;
  use(selector: string): Promise<void>;
  status(): Promise<unknown>;
  usage(): Promise<UsageResult>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function stringValue(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return undefined;
}

function booleanValue(record: Record<string, unknown>, keys: string[], fallback = false): boolean {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      if (["true", "active", "current", "healthy", "enabled"].includes(value.toLowerCase())) return true;
      if (["false", "inactive", "disabled", "unhealthy"].includes(value.toLowerCase())) return false;
    }
  }
  return fallback;
}


function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === "object" && value !== null) return redactMetadata(value as Record<string, unknown>);
  return value;
}

function redactMetadata(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (/token|secret|password|cookie|credential|api.?key|authorization/i.test(key)) continue;
    out[key] = redactValue(value);
  }
  return out;
}

function candidateArrays(value: unknown): unknown[][] {
  if (Array.isArray(value)) return [value];
  const record = asRecord(value);
  if (!record) return [];
  const arrays: unknown[][] = [];
  for (const key of ["accounts", "items", "profiles", "users", "workspaces", "entries"]) {
    if (Array.isArray(record[key])) arrays.push(record[key] as unknown[]);
  }
  for (const nested of Object.values(record)) {
    const nestedRecord = asRecord(nested);
    if (!nestedRecord) continue;
    for (const key of ["accounts", "items", "profiles", "users"]) {
      if (Array.isArray(nestedRecord[key])) arrays.push(nestedRecord[key] as unknown[]);
    }
  }
  return arrays;
}

export function normalizeAccountList(value: unknown): ManagedAccount[] {
  const arrays = candidateArrays(value);
  const source = arrays[0] ?? [];
  return source.flatMap((item, index) => {
    const record = asRecord(item);
    if (!record) return [];
    const id = stringValue(record, ["id", "accountId", "account_id", "workspaceId", "workspace_id", "email", "username", "login", "label", "name"]) ?? String(index + 1);
    const active = booleanValue(record, ["active", "isActive", "is_active", "current", "selected"], false);
    const disabled = booleanValue(record, ["disabled", "isDisabled", "is_disabled"], false);
    const health = stringValue(record, ["health", "status", "state"]);
    return [{
      id,
      label: stringValue(record, ["label", "name", "displayName", "display_name"]),
      email: stringValue(record, ["email"]),
      username: stringValue(record, ["username", "login", "user"]),
      host: stringValue(record, ["host", "hostname"]),
      active,
      enabled: !disabled && booleanValue(record, ["enabled", "isEnabled", "is_enabled"], true),
      healthy: health ? !/unhealthy|error|invalid|expired|flagged/i.test(health) : undefined,
      limited: booleanValue(record, ["limited", "rateLimited", "rate_limited", "cooldown"], false),
      metadata: redactMetadata(record),
    }];
  });
}

async function firstSuccessful(command: string, variants: string[][], timeoutMs = 30_000): Promise<ExecResult> {
  let last: ExecResult | undefined;
  for (const args of variants) {
    try {
      const result = await runCaptured(command, args, { timeoutMs });
      last = result;
      if (result.code === 0) return result;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`${command} is not installed`, { cause: error });
      }
      throw error;
    }
  }
  throw new Error(`${command} failed: ${last?.stderr.trim() || last?.stdout.trim() || `exit ${last?.code ?? 1}`}`);
}

function usageFromPayload(target: string, payload: unknown): UsageResult {
  const record = asRecord(payload);
  let score: number | undefined;
  let summary = "Usage data available";
  if (record) {
    const remaining = record.remaining ?? record.limit_remaining ?? record.remainingCredits ?? record.balance;
    if (typeof remaining === "number") score = remaining;
    const percentage = record.percentage ?? record.usedPercentage ?? record.usage_percentage;
    if (typeof percentage === "number") score = 100 - percentage;
    const selected = stringValue(record, ["selectedAccount", "activeAccount", "account", "email"]);
    if (selected) summary = `Active account ${selected}; usage data available`;
  }
  return { target, source: "account-driver", available: true, fetchedAt: new Date().toISOString(), summary, ...(score !== undefined ? { score } : {}), data: payload };
}

const codexDriver: AccountDriver = {
  id: "codex-multi-auth",
  displayName: "Codex Multi Auth",
  command: "codex-multi-auth",
  supportsUsage: true,
  async list() {
    const result = await firstSuccessful(this.command, [["list", "--json"], ["report", "--json"], ["list"]]);
    const parsed = parseJsonOutput(result.stdout);
    return parsed ? normalizeAccountList(parsed) : [];
  },
  async use(selector) {
    await firstSuccessful(this.command, [["switch", selector, "--json"], ["switch", selector]]);
  },
  async status() {
    const result = await firstSuccessful(this.command, [["status", "--json"], ["report", "--json"], ["status"]]);
    return parseJsonOutput(result.stdout) ?? { text: result.stdout.trim() };
  },
  async usage() {
    try {
      const result = await firstSuccessful(this.command, [["monitor", "--json"], ["report", "--live", "--json"], ["forecast", "--live", "--json"]], 60_000);
      return usageFromPayload(this.id, parseJsonOutput(result.stdout) ?? { text: result.stdout.trim() });
    } catch (error) {
      return { target: this.id, source: "account-driver", available: false, fetchedAt: new Date().toISOString(), summary: "Codex usage unavailable", error: (error as Error).message };
    }
  },
};

const openCodeDriver: AccountDriver = {
  id: "opencode-codex-multi-auth",
  displayName: "OpenCode Codex Multi Auth",
  command: "oc-codex-multi-auth",
  supportsUsage: true,
  async list() {
    const result = await firstSuccessful(this.command, [["list", "--json"], ["status", "--json"], ["list"]]);
    const parsed = parseJsonOutput(result.stdout);
    return parsed ? normalizeAccountList(parsed) : [];
  },
  async use(selector) {
    await firstSuccessful(this.command, [["switch", selector, "--json"], ["switch", selector]]);
  },
  async status() {
    const result = await firstSuccessful(this.command, [["status", "--json"], ["status"]]);
    return parseJsonOutput(result.stdout) ?? { text: result.stdout.trim() };
  },
  async usage() {
    try {
      const result = await firstSuccessful(this.command, [["limits", "--json"], ["status", "--json"], ["metrics", "--json"]]);
      return usageFromPayload(this.id, parseJsonOutput(result.stdout) ?? { text: result.stdout.trim() });
    } catch (error) {
      return { target: this.id, source: "account-driver", available: false, fetchedAt: new Date().toISOString(), summary: "OpenCode Codex usage unavailable", error: (error as Error).message };
    }
  },
};

function githubAccounts(payload: unknown): ManagedAccount[] {
  const root = asRecord(payload);
  const hosts = asRecord(root?.hosts);
  if (!hosts) return normalizeAccountList(payload);
  const out: ManagedAccount[] = [];
  for (const [host, value] of Object.entries(hosts)) {
    const hostRecord = asRecord(value);
    const accounts = Array.isArray(hostRecord?.accounts) ? hostRecord.accounts : Array.isArray(value) ? value : [];
    for (const [index, account] of accounts.entries()) {
      const record = asRecord(account);
      if (!record) continue;
      const username = stringValue(record, ["login", "username", "user", "name"]) ?? String(index + 1);
      out.push({ id: `${host}:${username}`, username, host, active: booleanValue(record, ["active", "current"], false), enabled: true, metadata: redactMetadata(record) });
    }
  }
  return out;
}

/**
 * ChefGroep vault — source of truth for OAuth/file account profiles.
 * CPM keeps encrypted API keys; account capture/switch/backup lives in chefvault.
 */
const chefvaultDriver: AccountDriver = {
  id: "chefvault",
  displayName: "ChefGroep Vault Accounts",
  command: "chefvault",
  supportsUsage: true,
  async list() {
    const result = await firstSuccessful(this.command, [
      ["--json", "accounts", "list"],
      ["accounts", "list", "--json"],
    ]);
    const parsed = parseJsonOutput(result.stdout);
    const root = asRecord(parsed);
    const accounts = Array.isArray(root?.accounts) ? root.accounts : [];
    const activeId = typeof root?.activeId === "string" ? root.activeId : null;
    const activeByProvider = asRecord(root?.activeByProvider) ?? {};
    return accounts.flatMap((item) => {
      const record = asRecord(item);
      if (!record) return [];
      const id = stringValue(record, ["id"]);
      if (!id) return [];
      const provider = stringValue(record, ["provider"]);
      const active =
        activeId === id ||
        (provider !== undefined && activeByProvider[provider] === id) ||
        booleanValue(record, ["active"], false);
      return [
        {
          id,
          label: stringValue(record, ["label", "name"]),
          email: stringValue(record, ["email"]),
          username: provider,
          active,
          enabled: true,
          metadata: redactMetadata(record),
        },
      ];
    });
  },
  async use(selector) {
    await firstSuccessful(this.command, [
      ["--json", "accounts", "switch", selector],
      ["accounts", "switch", selector, "--json"],
    ]);
  },
  async status() {
    const result = await firstSuccessful(this.command, [
      ["--json", "accounts", "status"],
      ["accounts", "status", "--json"],
    ]);
    return parseJsonOutput(result.stdout) ?? { text: result.stdout.trim() };
  },
  async usage() {
    try {
      const result = await firstSuccessful(this.command, [
        ["--json", "accounts", "status"],
        ["accounts", "status", "--json"],
      ]);
      const parsed = parseJsonOutput(result.stdout);
      const root = asRecord(parsed);
      const usage = asRecord(root?.usage);
      const today = asRecord(usage?.today);
      const requests = typeof today?.requests === "number" ? today.requests : undefined;
      const totalTokens = typeof today?.totalTokens === "number" ? today.totalTokens : undefined;
      const summary =
        requests !== undefined
          ? `OCX today: ${requests} requests` +
            (totalTokens !== undefined ? `, ${totalTokens} tokens` : "")
          : "ChefVault status available";
      return usageFromPayload(this.id, {
        summary,
        requests,
        totalTokens,
        ocx: root?.ocx,
        usage,
      });
    } catch (error) {
      return {
        target: this.id,
        source: "account-driver",
        available: false,
        fetchedAt: new Date().toISOString(),
        summary: "ChefVault usage unavailable",
        error: (error as Error).message,
      };
    }
  },
};

const githubDriver: AccountDriver = {
  id: "github",
  displayName: "GitHub CLI Accounts",
  command: "gh",
  supportsUsage: false,
  async list() {
    const result = await firstSuccessful(this.command, [["auth", "status", "--json", "hosts"], ["auth", "status"]]);
    const parsed = parseJsonOutput(result.stdout || result.stderr);
    return parsed ? githubAccounts(parsed) : [];
  },
  async use(selector) {
    const [possibleHost, possibleUser] = selector.includes(":") ? selector.split(":", 2) : ["github.com", selector];
    await firstSuccessful(this.command, [["auth", "switch", "--hostname", possibleHost!, "--user", possibleUser!]]);
  },
  async status() {
    const result = await firstSuccessful(this.command, [["auth", "status", "--json", "hosts"], ["auth", "status"]]);
    return parseJsonOutput(result.stdout || result.stderr) ?? { text: `${result.stdout}${result.stderr}`.trim() };
  },
  async usage() {
    return { target: this.id, source: "account-driver", available: false, fetchedAt: new Date().toISOString(), summary: "GitHub CLI does not expose coding quota usage through gh auth" };
  },
};

export const accountDrivers: AccountDriver[] = [
  chefvaultDriver,
  codexDriver,
  openCodeDriver,
  githubDriver,
];

export function getAccountDriver(id: string): AccountDriver {
  const driver = accountDrivers.find((item) => item.id === id);
  if (!driver) throw new Error(`Unknown account driver: ${id}`);
  return driver;
}

export function accountDriverSummaries(): AccountDriverSummary[] {
  return accountDrivers.map((driver) => ({
    id: driver.id,
    displayName: driver.displayName,
    command: driver.command,
    installed: commandExists(driver.command),
    supportsUsage: driver.supportsUsage,
    supportsNext: true,
  }));
}

export async function listDriverAccounts(id: string): Promise<ManagedAccount[]> {
  return await getAccountDriver(id).list();
}

export async function useDriverAccount(id: string, selector: string): Promise<void> {
  await getAccountDriver(id).use(selector);
}

export async function nextDriverAccount(id: string): Promise<ManagedAccount> {
  const driver = getAccountDriver(id);
  const accounts = (await driver.list()).filter((item) => item.enabled && item.healthy !== false && !item.limited);
  if (!accounts.length) throw new Error(`No enabled healthy accounts found for ${id}`);
  const activeIndex = accounts.findIndex((item) => item.active);
  const next = accounts[(activeIndex + 1 + accounts.length) % accounts.length]!;
  await driver.use(next.id.includes(":") && id === "github" ? next.id : next.email ?? next.username ?? next.label ?? next.id);
  return next;
}

export async function accountDriverStatus(id: string): Promise<unknown> {
  return await getAccountDriver(id).status();
}

export async function accountDriverUsage(id: string): Promise<UsageResult> {
  return await getAccountDriver(id).usage();
}
