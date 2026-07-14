import { fileURLToPath } from "node:url";
import { runInherited } from "../core/run.js";
import { formatUserFacingError, resolveBunBinary, resolveOpenTuiStatus } from "../core/cli-dx.js";
import type { ProviderId, UsageResult } from "../types.js";
import { providers } from "../providers/catalog.js";
import { loadState, updateProviderPreference } from "../core/state.js";
import { listSecrets, providerScope, rotateSecret } from "../core/vault.js";
import { accountDriverSummaries, listDriverAccounts, nextDriverAccount } from "../accounts/index.js";
import { adapters } from "../adapters/index.js";
import { detectAdapters } from "../core/detect.js";
import { loadRegistry } from "../resources/registry.js";
import { fetchProviderUsage, loadUsageCache, saveUsageCache, selectBestProviderKey } from "../usage/index.js";

export interface DashboardProviderRow {
  id: ProviderId;
  name: string;
  enabled: boolean;
  activeKey?: string;
  keys: number;
  model?: string;
  usage?: UsageResult;
}

export interface DashboardSnapshot {
  generatedAt: string;
  providers: DashboardProviderRow[];
  accounts: Array<{ id: string; name: string; installed: boolean; active?: string; count?: number; supportsUsage: boolean }>;
  tools: { total: number; installed: number; automatic: number; guided: number };
  resources: { total: number; enabled: number };
}

export async function buildDashboardSnapshot(home: string): Promise<DashboardSnapshot> {
  const state = await loadState(home);
  const cache = await loadUsageCache(home);
  const providerRows: DashboardProviderRow[] = [];
  for (const provider of providers) {
    const keys = await listSecrets(home, providerScope(provider.id), { [provider.keyEnv]: process.env[provider.keyEnv] });
    providerRows.push({
      id: provider.id,
      name: provider.displayName,
      enabled: state.providers[provider.id]?.enabled ?? false,
      activeKey: keys.find((item) => item.active)?.alias,
      keys: keys.filter((item) => !item.disabled).length,
      model: state.providers[provider.id]?.defaultModel ?? provider.defaultModel,
      usage: cache.results.find((item) => item.target === provider.id && (item.alias === keys.find((key) => key.active)?.alias || !item.alias)),
    });
  }
  const accounts = [];
  for (const driver of accountDriverSummaries()) {
    let rows: Awaited<ReturnType<typeof listDriverAccounts>> = [];
    if (driver.installed) {
      try { rows = await listDriverAccounts(driver.id); } catch { rows = []; }
    }
    const active = rows.find((item) => item.active);
    accounts.push({ id: driver.id, name: driver.displayName, installed: driver.installed, active: active?.email ?? active?.username ?? active?.label ?? active?.id, count: rows.length, supportsUsage: driver.supportsUsage });
  }
  const detected = detectAdapters(adapters);
  const registry = await loadRegistry(home);
  return {
    generatedAt: new Date().toISOString(),
    providers: providerRows,
    accounts,
    tools: {
      total: adapters.length,
      installed: detected.filter((item) => item.installed).length,
      automatic: adapters.filter((item) => (item.providerInjection ?? "automatic") === "automatic").length,
      guided: adapters.filter((item) => item.providerInjection === "guided").length,
    },
    resources: { total: registry.resources.length, enabled: registry.resources.filter((item) => item.enabled).length },
  };
}

function usageLabel(usage?: UsageResult): string {
  if (!usage) return "usage: not fetched";
  return usage.available ? usage.summary : `usage unavailable${usage.error ? ` (${usage.error})` : ""}`;
}

function renderSection(snapshot: DashboardSnapshot, tab: number, cursor: number): string {
  if (tab === 0) {
    return [
      `Providers  ${snapshot.providers.filter((item) => item.enabled).length}/${snapshot.providers.length} enabled`,
      `Tools      ${snapshot.tools.installed}/${snapshot.tools.total} installed (${snapshot.tools.automatic} automatic, ${snapshot.tools.guided} guided)`,
      `Resources  ${snapshot.resources.enabled}/${snapshot.resources.total} enabled`,
      `Accounts   ${snapshot.accounts.filter((item) => item.installed).length}/${snapshot.accounts.length} drivers installed`,
      "",
      "Use ←/→ tabs, j/k selection, n next key/account, b best key, r refresh usage, q quit.",
    ].join("\n");
  }
  if (tab === 1) {
    return snapshot.providers.map((item, index) => `${index === cursor ? "▶" : " "} ${item.enabled ? "●" : "○"} ${item.id.padEnd(17)} key=${(item.activeKey ?? "none").padEnd(14)} slots=${String(item.keys).padEnd(2)} model=${item.model ?? "n/a"}\n    ${usageLabel(item.usage)}`).join("\n");
  }
  if (tab === 2) {
    return snapshot.accounts.map((item, index) => `${index === cursor ? "▶" : " "} ${item.installed ? "●" : "○"} ${item.id.padEnd(28)} accounts=${item.count ?? 0} active=${item.active ?? "none"}`).join("\n");
  }
  if (tab === 3) {
    return adapters.map((item) => `${item.providerInjection === "automatic" ? "A" : item.providerInjection === "guided" ? "G" : "-"} ${item.id.padEnd(24)} ${item.displayName}`).join("\n");
  }
  return `Managed resources: ${snapshot.resources.enabled}/${snapshot.resources.total} enabled\n\nUse cpm resource list --json for full detail.`;
}

export async function runTui(home: string): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("cpm tui requires an interactive terminal; use cpm agent or --json in automation");
  if (process.versions.bun) {
    await runTuiDirect(home);
    return;
  }
  const openTui = resolveOpenTuiStatus();
  if (!openTui.available) throw new Error(openTui.hint ?? "OpenTUI is not installed.");
  const bun = resolveBunBinary();
  if (!bun.available || !bun.path) {
    throw new Error(bun.hint ?? "Bun/OpenTUI runtime is unavailable. Reinstall CPM with optional dependencies enabled or set CPM_BUN_BIN.");
  }
  const runner = fileURLToPath(new URL("./tui-runner.js", import.meta.url));
  try {
    const code = await runInherited(bun.path, [runner, "--home", home], {});
    if (![0, 1, 130].includes(code)) throw new Error(`OpenTUI runner exited with code ${code}`);
  } catch (error) {
    throw new Error(formatUserFacingError(error));
  }
}

export async function runTuiDirect(home: string): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("cpm tui requires an interactive terminal; use cpm agent or --json in automation");
  const openTui = resolveOpenTuiStatus();
  if (!openTui.available) throw new Error(openTui.hint ?? "OpenTUI is not installed.");
  let core: typeof import("@opentui/core");
  try { core = await import("@opentui/core"); } catch (error) {
    throw new Error(formatUserFacingError(error));
  }
  const renderer = await core.createCliRenderer({ exitOnCtrlC: true, backgroundColor: "#071018" });
  const tabs = ["Overview", "Providers", "Accounts", "Tools", "Resources"];
  let tab = 0;
  let cursor = 0;
  let busy = false;
  let message = "Ready";
  let snapshot = await buildDashboardSnapshot(home);

  const header = new core.TextRenderable(renderer, { id: "cpm-header", position: "absolute", top: 1, left: 2, width: "96%", height: 3, content: "" });
  const body = new core.TextRenderable(renderer, { id: "cpm-body", position: "absolute", top: 5, left: 2, width: "96%", height: "80%", content: "" });
  const footer = new core.TextRenderable(renderer, { id: "cpm-footer", position: "absolute", bottom: 1, left: 2, width: "96%", height: 2, content: "" });
  renderer.root.add(header);
  renderer.root.add(body);
  renderer.root.add(footer);

  const maxCursor = () => tab === 1 ? snapshot.providers.length - 1 : tab === 2 ? snapshot.accounts.length - 1 : 0;
  const draw = () => {
    header.content = `CPM CONTROL PLANE    ${tabs.map((name, index) => index === tab ? `[${name}]` : name).join("  ")}\n${snapshot.generatedAt}`;
    body.content = renderSection(snapshot, tab, cursor);
    footer.content = `${busy ? "Working…" : message}   ←/→ tabs  j/k move  n next  b best  r refresh  q quit`;
  };
  const refresh = async () => { snapshot = await buildDashboardSnapshot(home); cursor = Math.min(cursor, Math.max(0, maxCursor())); draw(); };
  const action = async (fn: () => Promise<void>) => {
    if (busy) return;
    busy = true; draw();
    try { await fn(); message = "Done"; } catch (error) { message = (error as Error).message; }
    busy = false; await refresh();
  };

  renderer.keyInput.on("keypress", (key: { name?: string }) => {
    const name = key.name ?? "";
    if (name === "q" || name === "escape") { renderer.destroy(); return; }
    if (busy) return;
    if (["right", "l", "tab"].includes(name)) { tab = (tab + 1) % tabs.length; cursor = 0; draw(); return; }
    if (["left", "h"].includes(name)) { tab = (tab - 1 + tabs.length) % tabs.length; cursor = 0; draw(); return; }
    if (["down", "j"].includes(name)) { cursor = Math.min(maxCursor(), cursor + 1); draw(); return; }
    if (["up", "k"].includes(name)) { cursor = Math.max(0, cursor - 1); draw(); return; }
    if (name === "n" || name === "enter") {
      void action(async () => {
        if (tab === 1) {
          const provider = snapshot.providers[cursor];
          if (!provider) return;
          const alias = await rotateSecret(home, providerScope(provider.id));
          await updateProviderPreference(home, provider.id, { activeKey: alias });
        } else if (tab === 2) {
          const driver = snapshot.accounts[cursor];
          if (driver?.installed) await nextDriverAccount(driver.id);
        }
      });
      return;
    }
    if (name === "b" && tab === 1) {
      void action(async () => {
        const provider = snapshot.providers[cursor];
        if (!provider) return;
        const best = await selectBestProviderKey(home, provider.id);
        await updateProviderPreference(home, provider.id, { activeKey: best.alias });
        await saveUsageCache(home, [best]);
      });
      return;
    }
    if (name === "r") {
      void action(async () => {
        if (tab === 1) {
          const provider = snapshot.providers[cursor];
          if (provider) await saveUsageCache(home, [await fetchProviderUsage(home, provider.id)]);
        }
      });
    }
  });
  draw();
  await new Promise<void>((resolve) => renderer.on("destroy", () => resolve()));
}
