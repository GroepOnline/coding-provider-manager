#!/usr/bin/env node
import fs from "node:fs/promises";
import { Command } from "commander";
import { checkbox, confirm, input, password, select } from "@inquirer/prompts";
import pc from "picocolors";
import { adapters, adapterMap } from "./adapters/index.js";
import { displayPath, homeDir } from "./core/paths.js";
import { detectAdapters } from "./core/detect.js";
import { renderPlan } from "./core/render.js";
import { atomicWrite } from "./core/fs.js";
import { createBackup, listBackups, rollbackBackup } from "./core/backup.js";
import { runInherited } from "./core/run.js";
import {
  applyCommandHelpGroups,
  CLI_HELP_EXAMPLES,
  formatUserFacingError,
  inspectDependencies,
  powershellCompletionScript,
  resolveRuntimePaths,
} from "./core/cli-dx.js";
import { accountDriverSummaries, accountDriverStatus, accountDriverUsage, listDriverAccounts, nextDriverAccount, useDriverAccount } from "./accounts/index.js";
import {
  fetchUsageTarget,
  nativeUsageAllowlistLabel,
  providerSupportsNativeUsage,
  saveUsageCache,
  selectBestProviderKey,
} from "./usage/index.js";
import { agentManifest, dispatchAgentRequest, serveAgentJsonl } from "./agent/index.js";
import { buildDashboardSnapshot, runTui } from "./tui/index.js";
import { providers, getProvider, modelProtocol } from "./providers/catalog.js";
import { fetchProviderModels, probeProvider, resolveProviderModels } from "./providers/models.js";
import { loadState, saveState, updateProviderPreference } from "./core/state.js";
import {
  addSecret,
  listSecrets,
  providerScope,
  removeSecret,
  resolveSecret,
  rotateSecret,
  setSecretDisabled,
  useSecret,
} from "./core/vault.js";
import { envFilePath, materializeActiveEnvironment, type ShellKind } from "./core/env.js";
import { loadRegistry, removeResource, setResourceEnabled, upsertResource } from "./resources/registry.js";
import { planMcpResources, resourceRuntimeEnv } from "./resources/apply.js";
import { createSyncBundle, importSyncBundle, sshPipe } from "./core/sync.js";
import { authFlows, getAuthFlow } from "./auth/catalog.js";
import { runAuthCommand } from "./auth/run.js";
import type {
  AdapterContext,
  ManagedResource,
  ProviderId,
  ProviderProfile,
  ResourceKind,
  SyncBundle,
  ToolId,
  PlannedChange,
} from "./types.js";

const program = new Command();
program
  .name("cpm")
  .description("Coding Provider Manager — multi-provider keys, OAuth accounts, usage, coding tools, MCP and SSH sync")
  .version("0.4.0")
  .showHelpAfterError("(add --help for additional information)")
  .addHelpText("after", `\n${CLI_HELP_EXAMPLES}\n`);
program.action(async () => {
  if (process.stdin.isTTY && process.stdout.isTTY) await runTui(home);
  else console.log(JSON.stringify(agentManifest()));
});

const home = homeDir();

function commaList(value?: string): string[] {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function parseTools(value: string | undefined, provider?: ProviderProfile): ToolId[] {
  if (!value || value === "default") return provider?.defaultTools ?? ["opencode", "factory", "kilo", "crush"];
  if (value === "all") return (provider?.allowedTools ?? adapters.map((item) => item.id)).filter((id) => adapterMap.has(id));
  const result = commaList(value) as ToolId[];
  for (const id of result) if (!adapterMap.has(id)) throw new Error(`Unknown tool: ${id}`);
  return result;
}

function parseProviderId(value?: string): ProviderId {
  return getProvider(value || "zai-coding").id;
}

async function activeProviderId(explicit?: string): Promise<ProviderId> {
  if (explicit) return parseProviderId(explicit);
  const state = await loadState(home);
  return state.selectedProviders?.[0] ?? "zai-coding";
}

async function providerKey(provider: ProviderProfile, alias?: string, interactive = false): Promise<string> {
  try {
    return (await resolveSecret(home, providerScope(provider.id), alias, provider.keyEnv)).value;
  } catch (error) {
    if (!interactive || !process.stdin.isTTY) throw error;
    return await password({ message: `${provider.displayName} API key`, mask: "*" });
  }
}

async function contextFor(
  provider: ProviderProfile,
  options: { model?: string; discover?: boolean; makeDefault?: boolean; keyAlias?: string } = {},
): Promise<AdapterContext> {
  const state = await loadState(home);
  const preference = state.providers[provider.id] ?? {};
  let key: string | undefined;
  if (options.discover) {
    try { key = await providerKey(provider, options.keyAlias, false); } catch { key = undefined; }
  }
  const available = await resolveProviderModels(home, provider, Boolean(options.discover), key);
  const selectedIds = preference.selectedModels?.length ? new Set(preference.selectedModels) : undefined;
  const selectedModels = selectedIds ? available.filter((item) => selectedIds.has(item.id)) : available;
  const models = selectedModels.length ? selectedModels : available;
  const selectedModel = options.model
    ?? preference.defaultModel
    ?? provider.defaultModel
    ?? models[0]?.id;
  if (!selectedModel) throw new Error(`No model available for ${provider.id}`);
  return { home, cwd: process.cwd(), provider, models, selectedModel, makeDefault: options.makeDefault };
}

async function plansForProvider(provider: ProviderProfile, options: {
  tools?: string;
  model?: string;
  discover?: boolean;
  makeDefault?: boolean;
  keyAlias?: string;
}): Promise<{ ctx: AdapterContext; plans: PlannedChange[] }> {
  const ctx = await contextFor(provider, options);
  const state = await loadState(home);
  const savedTools = state.providers[provider.id]?.selectedTools;
  const tools = options.tools ? parseTools(options.tools, provider) : savedTools?.length ? savedTools : parseTools("default", provider);
  const plans: PlannedChange[] = [];
  for (const id of tools) plans.push(await adapterMap.get(id)!.plan(ctx));
  return { ctx, plans };
}

async function applyPlans(plans: Array<{ status: string; path?: string; after?: string }>, backupHome = home): Promise<string | undefined> {
  const candidates = plans.filter((plan) => plan.status === "ready" && plan.path && plan.after !== undefined) as Array<{ path: string; after: string }>;
  const byPath = new Map<string, string>();
  for (const item of candidates) {
    const previous = byPath.get(item.path);
    if (previous !== undefined && previous !== item.after) {
      throw new Error(`Conflicting CPM plans target the same file: ${item.path}`);
    }
    byPath.set(item.path, item.after);
  }
  const writable = [...byPath.entries()].map(([path, after]) => ({ path, after }));
  if (!writable.length) return undefined;
  const backupId = await createBackup(writable.map((item) => item.path), backupHome);
  try {
    for (const item of writable) await atomicWrite(item.path, item.after);
    return backupId;
  } catch (error) {
    await rollbackBackup(backupId, backupHome);
    throw new Error(`Apply failed and was rolled back: ${(error as Error).message}`);
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

program.command("apps")
  .alias("tools")
  .description("List coding apps, CLIs, IDE surfaces, provider-injection support and authentication flows")
  .option("--json", "machine-readable output")
  .action((options) => {
    const detected = new Map(detectAdapters(adapters).map((item) => [item.id, item]));
    const rows = adapters.map((adapter) => ({
      id: adapter.id,
      name: adapter.displayName,
      installed: detected.get(adapter.id)?.installed ?? false,
      detectedAt: detected.get(adapter.id)?.detectedAt ?? detected.get(adapter.id)?.command,
      surfaces: adapter.surfaces ?? [],
      providerInjection: adapter.providerInjection ?? "automatic",
      authFlows: adapter.authFlowIds ?? [],
      sharedConfigGroup: adapter.sharedConfigGroup,
    }));
    if (options.json) console.log(JSON.stringify(rows, null, 2));
    else for (const row of rows) {
      const state = row.installed ? pc.green("✓") : pc.dim("·");
      console.log(`${state} ${row.id.padEnd(18)} ${row.providerInjection.padEnd(9)} ${row.surfaces.join(",").padEnd(18)} ${row.name}${row.authFlows.length ? `  auth=${row.authFlows.join(",")}` : ""}`);
    }
  });

program.command("tui")
  .description("Open the full interactive OpenTUI control plane")
  .option("--snapshot", "print the dashboard model as JSON instead of opening the UI")
  .action(async (options) => {
    if (options.snapshot) console.log(JSON.stringify(await buildDashboardSnapshot(home), null, 2));
    else await runTui(home);
  });

const accountsCommand = program.command("accounts").alias("account").description("Manage saved OAuth/account pools without repeated login or logout");
accountsCommand.command("drivers")
  .option("--json")
  .action((options) => {
    const rows = accountDriverSummaries();
    if (options.json) console.log(JSON.stringify(rows, null, 2));
    else for (const row of rows) console.log(`${row.installed ? pc.green("✓") : pc.dim("·")} ${row.id.padEnd(30)} ${row.displayName} usage=${row.supportsUsage ? "yes" : "no"}`);
  });
accountsCommand.command("install")
  .argument("<driver>")
  .action(async (driver) => {
    if (driver === "codex-multi-auth") {
      process.exitCode = await runInherited("npm", ["install", "-g", "codex-multi-auth"], {});
      return;
    }
    if (driver === "opencode-codex-multi-auth") {
      process.exitCode = await runInherited("npm", ["install", "-g", "oc-codex-multi-auth"], {});
      return;
    }
    if (driver === "github") throw new Error("Install GitHub CLI from the official gh package for your operating system, then run cpm auth login github-cli");
    throw new Error(`Unknown account driver: ${driver}`);
  });
accountsCommand.command("list")
  .argument("[driver]")
  .option("--json")
  .action(async (driver, options) => {
    const targets = driver ? [driver] : accountDriverSummaries().filter((item) => item.installed).map((item) => item.id);
    const output = [];
    for (const id of targets) {
      const accounts = await listDriverAccounts(id);
      output.push({ driver: id, accounts });
      if (!options.json) {
        console.log(pc.bold(id));
        for (const account of accounts) console.log(`${account.active ? pc.green("*") : " "} ${(account.email ?? account.username ?? account.label ?? account.id).padEnd(36)} ${account.healthy === false ? pc.red("unhealthy") : account.limited ? pc.yellow("limited") : "ready"}`);
      }
    }
    if (options.json) console.log(JSON.stringify(output, null, 2));
  });
accountsCommand.command("use")
  .argument("<driver>")
  .argument("<selector>")
  .action(async (driver, selector) => { await useDriverAccount(driver, selector); console.log(pc.green(`Active ${driver} account: ${selector}`)); });
accountsCommand.command("next")
  .argument("<driver>")
  .option("--json")
  .action(async (driver, options) => {
    const account = await nextDriverAccount(driver);
    if (options.json) console.log(JSON.stringify(account, null, 2));
    else console.log(pc.green(`Switched ${driver} to ${account.email ?? account.username ?? account.label ?? account.id}.`));
  });
accountsCommand.command("status")
  .argument("[driver]")
  .option("--json")
  .action(async (driver, options) => {
    const targets = driver ? [driver] : accountDriverSummaries().filter((item) => item.installed).map((item) => item.id);
    const output = [];
    for (const id of targets) output.push({ driver: id, status: await accountDriverStatus(id) });
    if (options.json) console.log(JSON.stringify(output, null, 2));
    else for (const item of output) console.log(`${pc.bold(item.driver)}
${JSON.stringify(item.status, null, 2)}`);
  });
accountsCommand.command("usage")
  .argument("[driver]")
  .option("--json")
  .action(async (driver, options) => {
    const targets = driver ? [driver] : accountDriverSummaries().filter((item) => item.installed && item.supportsUsage).map((item) => item.id);
    const results = [];
    for (const id of targets) results.push(await accountDriverUsage(id));
    await saveUsageCache(home, results);
    if (options.json) console.log(JSON.stringify(results, null, 2));
    else for (const result of results) console.log(`${result.available ? pc.green("✓") : pc.yellow("!")} ${result.target}: ${result.summary}`);
  });

program.command("usage")
  .description(`Fetch provider balance/quota or external account-pool usage (native providers: ${nativeUsageAllowlistLabel()})`)
  .argument("[target]", "provider/account driver ID or all", "all")
  .option("--key <alias>", "specific provider key alias")
  .option("--all-keys", "fetch every enabled key slot")
  .option("--json")
  .action(async (target, options) => {
    const targets = target === "all"
      ? [...providers.map((item) => item.id), ...accountDriverSummaries().filter((item) => item.installed && item.supportsUsage).map((item) => item.id)]
      : [target];
    const results = [];
    for (const id of targets) results.push(...await fetchUsageTarget(home, id, { allKeys: Boolean(options.allKeys), alias: options.key }));
    await saveUsageCache(home, results);
    if (options.json) console.log(JSON.stringify(results, null, 2));
    else {
      for (const result of results) {
        const mark = result.available ? pc.green("✓") : result.error === "native-usage-unsupported" ? pc.yellow("!") : pc.dim("·");
        console.log(`${mark} ${result.target}${result.alias ? `:${result.alias}` : ""}  ${result.summary}${result.resetAt ? `  reset=${result.resetAt}` : ""}`);
      }
      if (target === "all" && results.some((item) => item.error === "native-usage-unsupported")) {
        console.log(pc.dim(`Native usage allowlist: ${nativeUsageAllowlistLabel()}. Other providers have no verified public usage API.`));
      }
    }
  });

program.command("switch")
  .description("One-command key/account switching (best requires native usage providers)")
  .argument("<target>", "provider ID or account driver ID")
  .argument("[selector]", "key alias/account selector, next or best", "next")
  .option("--json")
  .action(async (target, selector, options) => {
    if (accountDriverSummaries().some((item) => item.id === target)) {
      const result = selector === "next" ? await nextDriverAccount(target) : (await useDriverAccount(target, selector), { id: selector, active: true });
      if (options.json) console.log(JSON.stringify(result, null, 2));
      else console.log(pc.green(`Switched ${target} to ${selector === "next" ? (result as { id: string }).id : selector}.`));
      return;
    }
    const provider = getProvider(target);
    let alias: string | undefined;
    let result: unknown;
    if (selector === "best") {
      if (!providerSupportsNativeUsage(provider.id)) {
        throw new Error(`switch ${provider.id} best requires native usage. Supported: ${nativeUsageAllowlistLabel()}. Use \`cpm switch ${provider.id} next\` instead.`);
      }
      const best = await selectBestProviderKey(home, provider);
      alias = best.alias;
      result = best;
      await saveUsageCache(home, [best]);
    } else if (selector === "next") {
      alias = await rotateSecret(home, providerScope(provider.id));
      result = { provider: provider.id, activeKey: alias };
    } else {
      await useSecret(home, providerScope(provider.id), selector);
      alias = selector;
      result = { provider: provider.id, activeKey: alias };
    }
    await updateProviderPreference(home, provider.id, { activeKey: alias });
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else console.log(pc.green(`Active ${provider.id} key: ${alias}`));
  });

const agentCommand = program.command("agent").description("Machine protocol for autonomous agents; never prompts and never returns secret values");
agentCommand.command("manifest").action(() => console.log(JSON.stringify(agentManifest(), null, 2)));
agentCommand.command("call")
  .argument("<method>")
  .option("--params <json>", "JSON parameter object", "{}")
  .option("--stdin", "read parameter object from stdin")
  .action(async (method, options) => {
    const raw = options.stdin ? await readStdin() : options.params;
    const params = JSON.parse(raw || "{}") as Record<string, unknown>;
    const response = await dispatchAgentRequest(home, { method, params });
    console.log(JSON.stringify(response));
    if (!response.ok) process.exitCode = 1;
  });
agentCommand.command("serve").description("Serve newline-delimited JSON requests on stdin/stdout").action(async () => await serveAgentJsonl(home));

const authCommand = program.command("auth").description("Run supported browser, device and API-key login flows without copying OAuth tokens into CPM");
authCommand.command("list")
  .option("--json", "machine-readable output")
  .action((options) => {
    if (options.json) console.log(JSON.stringify(authFlows, null, 2));
    else for (const flow of authFlows) console.log(`${flow.id.padEnd(28)} ${flow.kind.padEnd(14)} ${flow.displayName}`);
  });
authCommand.command("login")
  .argument("<flow>")
  .option("--key <alias>", "CPM key alias for API-key login flows")
  .action(async (flowId, options) => {
    const flow = getAuthFlow(flowId);
    let secret: string | undefined;
    if (flow.kind === "api-key-login") {
      if (flow.providerKey) {
        const provider = getProvider(flow.providerKey);
        secret = await providerKey(provider, options.key, true);
      } else if (flow.secretScope) {
        try {
          secret = (await resolveSecret(home, flow.secretScope, options.key, flow.secretEnv)).value;
        } catch (error) {
          if (!process.stdin.isTTY) throw error;
          secret = await password({ message: `${flow.displayName} token`, mask: "*" });
        }
      } else {
        throw new Error(`${flow.id} has no credential mapping`);
      }
    }
    process.exitCode = await runAuthCommand(flow, "login", secret);
  });
authCommand.command("status")
  .argument("[flow]")
  .action(async (flowId) => {
    const candidates = flowId ? [getAuthFlow(flowId)] : authFlows.filter((flow) => flow.statusArgs);
    const seen = new Set<string>();
    const targets = candidates.filter((flow) => {
      const key = `${flow.command}:${(flow.statusArgs ?? []).join("\0")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    for (const flow of targets) {
      console.log(pc.bold(flow.displayName));
      process.exitCode = await runAuthCommand(flow, "status");
      if (process.exitCode) break;
    }
  });
authCommand.command("logout")
  .argument("<flow>")
  .action(async (flowId) => {
    process.exitCode = await runAuthCommand(getAuthFlow(flowId), "logout");
  });

program.command("providers")
  .description("List provider profiles and active-key status")
  .option("--json", "machine-readable output")
  .action(async (options) => {
    const state = await loadState(home);
    const rows = [];
    for (const provider of providers) {
      const keys = await listSecrets(home, providerScope(provider.id), { [provider.keyEnv]: process.env[provider.keyEnv] });
      rows.push({
        id: provider.id,
        name: provider.displayName,
        enabled: state.providers[provider.id]?.enabled ?? false,
        activeKey: keys.find((item) => item.active)?.alias,
        keyEnv: provider.keyEnv,
        models: provider.models.length,
        protocols: [...new Set(provider.models.map((item) => modelProtocol(provider, item)))],
        authKind: provider.authKind,
        oauthFlows: provider.oauthFlowIds ?? [],
      });
    }
    if (options.json) console.log(JSON.stringify(rows, null, 2));
    else for (const row of rows) console.log(`${row.enabled ? pc.green("✓") : pc.dim("·")} ${row.id.padEnd(16)} ${row.name}  auth=${row.authKind} key=${row.activeKey ?? (row.authKind === "hybrid" ? "optional" : "missing")}  ${row.protocols.join(",")}`);
  });

program.command("detect").description("Detect supported coding tools").action(() => {
  for (const item of detectAdapters(adapters)) {
    console.log(`${item.installed ? pc.green("✓") : pc.dim("·")} ${item.id.padEnd(18)} ${item.displayName}${item.detectedAt ? ` (${item.detectedAt})` : item.command ? ` (${item.command})` : ""}`);
  }
});

program.command("configure")
  .description("Interactively select providers, models and target coding tools")
  .action(async () => {
    if (!process.stdin.isTTY) throw new Error("configure requires an interactive terminal");
    const state = await loadState(home);
    const selectedProviders = await checkbox<ProviderId>({
      message: "Enabled providers",
      choices: providers.map((provider) => ({
        name: `${provider.displayName} (${provider.keyEnv})`,
        value: provider.id,
        checked: state.providers[provider.id]?.enabled ?? false,
      })),
      required: true,
    });

    const selectedSet = new Set(selectedProviders);
    for (const provider of providers) {
      if (!selectedSet.has(provider.id)) {
        state.providers[provider.id] = { ...(state.providers[provider.id] ?? {}), enabled: false };
        continue;
      }
      let key: string | undefined;
      try { key = await providerKey(provider, undefined, false); } catch { key = undefined; }
      const fetchNow = await confirm({ message: `Fetch current ${provider.displayName} models now?${key ? "" : " (no key: static fallback may be used)"}`, default: true });
      const entry = fetchNow ? await fetchProviderModels(home, provider, key) : undefined;
      const available = entry?.models ?? await resolveProviderModels(home, provider);
      const previous = new Set(state.providers[provider.id]?.selectedModels ?? [provider.defaultModel].filter(Boolean) as string[]);
      const selectedModels = await checkbox<string>({
        message: `${provider.displayName}: models to expose`,
        choices: available.map((item) => ({
          name: `${item.name || item.id} [${modelProtocol(provider, item)}]`,
          value: item.id,
          checked: previous.has(item.id),
        })),
        required: true,
        pageSize: 20,
      });
      const detected = new Map(detectAdapters(adapters).map((item) => [item.id, item.installed]));
      const previousTools = new Set(state.providers[provider.id]?.selectedTools ?? provider.defaultTools ?? []);
      const selectedTools = await checkbox<ToolId>({
        message: `${provider.displayName}: coding tools`,
        choices: (provider.allowedTools ?? adapters.map((item) => item.id)).map((id) => ({
          name: `${adapterMap.get(id)?.displayName ?? id}${detected.get(id) ? " ✓ installed" : ""}`,
          value: id,
          checked: previousTools.has(id),
        })),
        required: true,
      });
      const defaultModel = await select<string>({
        message: `${provider.displayName}: default model`,
        choices: available.filter((item) => selectedModels.includes(item.id)).map((item) => ({ name: item.name || item.id, value: item.id })),
        default: state.providers[provider.id]?.defaultModel ?? provider.defaultModel,
      });
      state.providers[provider.id] = { enabled: true, selectedModels, selectedTools, defaultModel };
    }
    state.selectedProviders = selectedProviders;
    await saveState(home, state);
    console.log(pc.green("Saved provider/model/tool preferences."));
    if (await confirm({ message: "Apply the selected configurations now?", default: false })) {
      for (const providerId of selectedProviders) {
        const provider = getProvider(providerId);
        const result = await plansForProvider(provider, { makeDefault: true });
        for (const plan of result.plans) console.log(`${renderPlan(plan)}\n`);
        const backup = await applyPlans(result.plans);
        if (backup) console.log(pc.green(`${provider.id}: applied (backup ${backup})`));
      }
    }
  });

const modelsCommand = program.command("models").description("Fetch, cache and select provider models");
modelsCommand.command("list")
  .argument("[provider]")
  .option("--json", "machine-readable output")
  .action(async (providerId, options) => {
    const targets = providerId ? [getProvider(providerId)] : providers;
    const output = [];
    for (const provider of targets) {
      const models = await resolveProviderModels(home, provider);
      output.push({ provider: provider.id, models });
      if (!options.json) {
        console.log(pc.bold(provider.displayName));
        for (const item of models) console.log(`  ${item.id.padEnd(38)} ${modelProtocol(provider, item)}${item.context ? `  ctx=${item.context}` : ""}`);
      }
    }
    if (options.json) console.log(JSON.stringify(output, null, 2));
  });

modelsCommand.command("fetch")
  .argument("[provider]", "provider ID or all", "all")
  .option("--key <alias>", "named key slot")
  .option("--json", "machine-readable output")
  .action(async (providerId, options) => {
    const targets = providerId === "all" ? providers : [getProvider(providerId)];
    const output = [];
    for (const provider of targets) {
      let key: string | undefined;
      try { key = await providerKey(provider, options.key, false); } catch { key = undefined; }
      const entry = await fetchProviderModels(home, provider, key);
      output.push(entry);
      if (!options.json) console.log(`${provider.id}: ${entry.models.length} model(s), source=${entry.source.join(" | ")}`);
    }
    if (options.json) console.log(JSON.stringify(output, null, 2));
  });

modelsCommand.command("select")
  .argument("<provider>")
  .action(async (providerId) => {
    if (!process.stdin.isTTY) throw new Error("models select requires an interactive terminal");
    const provider = getProvider(providerId);
    const state = await loadState(home);
    const available = await resolveProviderModels(home, provider);
    const previous = new Set(state.providers[provider.id]?.selectedModels ?? [provider.defaultModel].filter(Boolean) as string[]);
    const selectedModels = await checkbox<string>({
      message: `${provider.displayName}: enabled models`,
      choices: available.map((item) => ({ name: `${item.name || item.id} [${modelProtocol(provider, item)}]`, value: item.id, checked: previous.has(item.id) })),
      required: true,
      pageSize: 20,
    });
    const defaultModel = await select<string>({
      message: "Default model",
      choices: available.filter((item) => selectedModels.includes(item.id)).map((item) => ({ name: item.name || item.id, value: item.id })),
    });
    await updateProviderPreference(home, provider.id, { enabled: true, selectedModels, defaultModel });
    console.log(pc.green(`Saved ${selectedModels.length} model(s) for ${provider.id}.`));
  });

const keyCommand = program.command("key").description("Manage multiple encrypted API-key slots per provider");
keyCommand.command("add")
  .argument("<provider>")
  .argument("[alias]", "slot alias", "default")
  .option("--from-env", "read the provider's canonical environment variable")
  .option("--inactive", "do not make this slot active")
  .action(async (providerId, alias, options) => {
    const provider = getProvider(providerId);
    const value = options.fromEnv ? process.env[provider.keyEnv] : process.stdin.isTTY ? await password({ message: `${provider.displayName} key (${alias})`, mask: "*" }) : (await readStdin()).trim();
    if (!value) throw new Error(options.fromEnv ? `${provider.keyEnv} is not set` : "No key provided");
    await addSecret(home, providerScope(provider.id), alias, value, !options.inactive);
    if (!options.inactive) await updateProviderPreference(home, provider.id, { activeKey: alias });
    console.log(pc.green(`Stored encrypted key slot ${provider.id}:${alias}${options.inactive ? "" : " (active)"}.`));
  });
keyCommand.command("list")
  .argument("[provider]")
  .option("--json", "machine-readable output")
  .action(async (providerId, options) => {
    const scope = providerId ? providerScope(getProvider(providerId).id) : undefined;
    const rows = await listSecrets(home, scope, providerId ? { [getProvider(providerId).keyEnv]: process.env[getProvider(providerId).keyEnv] } : undefined);
    if (options.json) console.log(JSON.stringify(rows, null, 2));
    else for (const row of rows) console.log(`${row.active ? pc.green("*") : " "} ${row.scope}:${row.alias} ${row.disabled ? pc.red("disabled") : row.source} fp=${row.fingerprint}`);
  });
keyCommand.command("use")
  .argument("<provider>")
  .argument("<alias>")
  .action(async (providerId, alias) => {
    const provider = getProvider(providerId);
    await useSecret(home, providerScope(provider.id), alias);
    await updateProviderPreference(home, provider.id, { activeKey: alias });
    console.log(pc.green(`Active ${provider.id} key: ${alias}`));
  });
keyCommand.command("rotate")
  .argument("<provider>")
  .action(async (providerId) => {
    const provider = getProvider(providerId);
    const alias = await rotateSecret(home, providerScope(provider.id));
    await updateProviderPreference(home, provider.id, { activeKey: alias });
    console.log(pc.green(`Rotated ${provider.id} to key slot ${alias}.`));
  });
keyCommand.command("next")
  .argument("<provider>")
  .option("--json")
  .action(async (providerId, options) => {
    const provider = getProvider(providerId);
    const alias = await rotateSecret(home, providerScope(provider.id));
    await updateProviderPreference(home, provider.id, { activeKey: alias });
    const result = { provider: provider.id, activeKey: alias };
    if (options.json) console.log(JSON.stringify(result)); else console.log(pc.green(`Active ${provider.id} key: ${alias}`));
  });
keyCommand.command("best")
  .description(`Select the key with the best remaining quota (native usage: ${nativeUsageAllowlistLabel()})`)
  .argument("<provider>")
  .option("--json")
  .action(async (providerId, options) => {
    const provider = getProvider(providerId);
    if (!providerSupportsNativeUsage(provider.id)) {
      throw new Error(`key best requires native usage for ${provider.id}. Supported: ${nativeUsageAllowlistLabel()}. Use \`cpm key next ${provider.id}\` or \`cpm key use ${provider.id} <alias>\`.`);
    }
    const best = await selectBestProviderKey(home, provider);
    await updateProviderPreference(home, provider.id, { activeKey: best.alias });
    await saveUsageCache(home, [best]);
    if (options.json) console.log(JSON.stringify(best, null, 2)); else console.log(pc.green(`Selected ${provider.id}:${best.alias} — ${best.summary}`));
  });
keyCommand.command("remove")
  .argument("<provider>")
  .argument("<alias>")
  .action(async (providerId, alias) => {
    const provider = getProvider(providerId);
    await removeSecret(home, providerScope(provider.id), alias);
    console.log(pc.green(`Removed ${provider.id}:${alias}.`));
  });
keyCommand.command("disable")
  .argument("<provider>")
  .argument("<alias>")
  .action(async (providerId, alias) => {
    await setSecretDisabled(home, providerScope(getProvider(providerId).id), alias, true);
    console.log(pc.green(`Disabled ${providerId}:${alias}.`));
  });
keyCommand.command("enable")
  .argument("<provider>")
  .argument("<alias>")
  .action(async (providerId, alias) => {
    await setSecretDisabled(home, providerScope(getProvider(providerId).id), alias, false);
    console.log(pc.green(`Enabled ${providerId}:${alias}.`));
  });

const secretCommand = program.command("secret").description("Manage generic secrets for MCPs, plugins and integrations");
secretCommand.command("add")
  .argument("<scope>")
  .argument("[alias]", "slot alias", "default")
  .option("--inactive", "do not make active")
  .action(async (scope, alias, options) => {
    const value = process.stdin.isTTY ? await password({ message: `${scope} secret (${alias})`, mask: "*" }) : (await readStdin()).trim();
    if (!value) throw new Error("No secret provided");
    await addSecret(home, scope, alias, value, !options.inactive);
    console.log(pc.green(`Stored encrypted secret ${scope}:${alias}.`));
  });
secretCommand.command("list").argument("[scope]").action(async (scope) => {
  for (const row of await listSecrets(home, scope)) console.log(`${row.active ? pc.green("*") : " "} ${row.scope}:${row.alias} ${row.disabled ? "disabled" : "enabled"} fp=${row.fingerprint}`);
});
secretCommand.command("use").argument("<scope>").argument("<alias>").action(async (scope, alias) => { await useSecret(home, scope, alias); });
secretCommand.command("rotate").argument("<scope>").action(async (scope) => console.log(await rotateSecret(home, scope)));
secretCommand.command("remove").argument("<scope>").argument("<alias>").action(async (scope, alias) => { await removeSecret(home, scope, alias); });

const envCommand = program.command("env").description("Materialize or locate active local environment files");
envCommand.command("write")
  .option("--shell <shell>", "dotenv, bash, zsh, fish, powershell", "dotenv")
  .action(async (options) => {
    const shell = options.shell as ShellKind;
    if (!["dotenv", "bash", "zsh", "fish", "powershell"].includes(shell)) throw new Error(`Unknown shell: ${shell}`);
    const file = await materializeActiveEnvironment(home, shell);
    console.log(pc.green(`Wrote ${file} with mode 0600. This file contains plaintext active keys.`));
  });
envCommand.command("path").option("--shell <shell>", "dotenv, bash, zsh, fish, powershell", "dotenv").action((options) => console.log(envFilePath(home, options.shell as ShellKind)));

program.command("plan")
  .description("Preview provider configuration changes")
  .option("-p, --provider <id>", "provider ID")
  .option("-t, --tools <ids>", "comma-separated tool IDs, default or all")
  .option("-m, --model <id>", "model ID")
  .option("--discover", "refresh provider model catalog")
  .option("--make-default", "set selected model as client default")
  .option("--saved", "plan every enabled provider from saved preferences")
  .action(async (options) => {
    const state = await loadState(home);
    const targets = options.saved
      ? (state.selectedProviders ?? []).map((id) => getProvider(id))
      : [getProvider(await activeProviderId(options.provider))];
    for (const provider of targets) {
      console.log(pc.bold(`\n${provider.displayName}`));
      const { plans } = await plansForProvider(provider, options);
      for (const plan of plans) console.log(`${renderPlan(plan)}\n`);
    }
  });

program.command("apply")
  .description("Apply provider and optional MCP configuration changes with backups")
  .option("-p, --provider <id>", "provider ID")
  .option("-t, --tools <ids>", "comma-separated tool IDs, default or all")
  .option("-m, --model <id>", "model ID")
  .option("--discover", "refresh provider model catalog")
  .option("--make-default", "set selected model as client default")
  .option("--saved", "apply every enabled provider from saved preferences")
  .option("--resources", "also render enabled MCP resources")
  .option("--yes", "apply without confirmation")
  .action(async (options) => {
    const state = await loadState(home);
    const targets = options.saved
      ? (state.selectedProviders ?? []).map((id) => getProvider(id))
      : [getProvider(await activeProviderId(options.provider))];
    for (const provider of targets) {
      const { plans } = await plansForProvider(provider, options);
      for (const plan of plans) console.log(`${renderPlan(plan)}\n`);
      if (!options.yes && process.stdin.isTTY && !(await confirm({ message: `Apply ${provider.displayName} changes?`, default: false }))) continue;
      const backup = await applyPlans(plans);
      if (backup) console.log(pc.green(`${provider.id}: applied. Backup ${backup}`));
      if (options.resources) {
        const tools = options.tools ? parseTools(options.tools, provider) : state.providers[provider.id]?.selectedTools ?? provider.defaultTools ?? [];
        const resourcePlans = [];
        for (const tool of tools) resourcePlans.push(await planMcpResources(home, tool));
        for (const plan of resourcePlans) console.log(`${renderPlan(plan)}\n`);
        const resourceBackup = await applyPlans(resourcePlans);
        if (resourceBackup) console.log(pc.green(`MCP resources applied. Backup ${resourceBackup}`));
      }
    }
  });

program.command("doctor")
  .description("Validate provider authentication, model listing, local paths and optional capabilities")
  .argument("[provider]")
  .option("-m, --model <id>", "model ID")
  .option("--key <alias>", "named key slot")
  .option("--all-keys", "test every enabled key slot")
  .option("--probe", "run chat, streaming and tool-call probes")
  .option("--paths-only", "only print resolved Windows/Unix CPM paths and dependency status")
  .action(async (providerId, options) => {
    const paths = resolveRuntimePaths(home);
    const deps = inspectDependencies();
    console.log(pc.bold("CPM paths"));
    console.log(`  platform=${paths.platform}/${paths.arch}  node=${paths.node}`);
    console.log(`  home=${displayPath(paths.home)}`);
    console.log(`  configRoot=${displayPath(paths.configRoot)}`);
    console.log(`  cpmRoot=${displayPath(paths.cpmRoot)}`);
    if (paths.appData) console.log(`  APPDATA=${displayPath(paths.appData)}`);
    if (paths.localAppData) console.log(`  LOCALAPPDATA=${displayPath(paths.localAppData)}`);
    console.log(pc.bold("Dependencies"));
    console.log(`  bun=${deps.bun.available ? pc.green("ok") : pc.yellow("missing")}${deps.bun.path ? ` (${deps.bun.path})` : ""}${deps.bun.hint && !deps.bun.available ? ` — ${deps.bun.hint}` : ""}`);
    console.log(`  openTui=${deps.openTui.available ? pc.green("ok") : pc.yellow("missing")}${deps.openTui.hint && !deps.openTui.available ? ` — ${deps.openTui.hint}` : ""}`);
    if (options.pathsOnly) return;

    const provider = getProvider(providerId || await activeProviderId());
    const summaries = options.allKeys
      ? (await listSecrets(home, providerScope(provider.id))).filter((item) => !item.disabled && item.source === "vault")
      : [{ alias: options.key }];
    for (const summary of summaries) {
      const alias = summary.alias;
      const key = await providerKey(provider, alias, false);
      const entry = await fetchProviderModels(home, provider, key);
      const selectedId = options.model ?? (await loadState(home)).providers[provider.id]?.defaultModel ?? provider.defaultModel ?? entry.models[0]?.id;
      const selected = entry.models.find((item) => item.id === selectedId) ?? entry.models[0];
      if (!selected) throw new Error(`No models for ${provider.id}`);
      if (entry.source.some((source) => source.startsWith("fetch-fallback:"))) {
        console.log(pc.yellow(`! ${provider.id} model endpoint was unavailable; validating the selected model directly.`));
      } else {
        console.log(pc.green(`✓ ${provider.id}:${alias ?? "active"} model listing passed; ${entry.models.length} model(s).`));
      }
      await probeProvider(provider, key, selected);
      console.log(pc.green(`✓ ${provider.id}:${alias ?? "active"} authentication and ${selected.id} basic ${modelProtocol(provider, selected)} probe passed.`));
      if (options.probe) {
        await probeProvider(provider, key, selected, { streaming: true });
        console.log(pc.green("✓ streaming probe passed."));
        if (selected.toolCall !== false) {
          await probeProvider(provider, key, selected, { toolCall: true });
          console.log(pc.green("✓ native tool-call probe passed."));
        }
      }
    }
  });

program.command("run")
  .description("Launch a coding CLI with active provider and resource secrets injected")
  .argument("<tool>")
  .argument("[args...]")
  .option("-p, --provider <id>", "provider ID")
  .option("-m, --model <id>", "model ID")
  .option("--key <alias>", "named key slot")
  .option("--account <selector>", "saved OAuth/account selector for Codex, OpenCode or GitHub-backed tools")
  .action(async (tool: ToolId, args: string[], options) => {
    const adapter = adapterMap.get(tool);
    if (options.account) {
      const driver = ["codex", "codex-app", "codex-ide"].includes(tool) ? "codex-multi-auth" : tool === "opencode" ? "opencode-codex-multi-auth" : ["copilot-cli", "github-copilot"].includes(tool) ? "github" : undefined;
      if (!driver) throw new Error(`${tool} has no account-switch driver`);
      await useDriverAccount(driver, options.account);
    }
    if (!adapter?.command || !adapter.runtimeEnv) throw new Error(`${tool} has no CPM runtime launcher`);
    const provider = getProvider(await activeProviderId(options.provider));
    if (provider.allowedTools && !provider.allowedTools.includes(tool)) throw new Error(`${tool} is not enabled for ${provider.id}`);
    const ctx = await contextFor(provider, { model: options.model, keyAlias: options.key });
    let providerEnv: Record<string, string> = {};
    try {
      const key = await providerKey(provider, options.key, provider.authKind !== "hybrid");
      providerEnv = adapter.runtimeEnv(ctx, key);
    } catch (error) {
      if (provider.authKind !== "hybrid") throw error;
    }
    const env = { ...providerEnv, ...await resourceRuntimeEnv(home, tool) };
    process.exitCode = await runInherited(adapter.command, args ?? [], env);
  });

const resourceCommand = program.command("resource").description("Manage MCPs, graph tools, integrations and plugins");
resourceCommand.command("list")
  .option("--kind <kind>")
  .option("--json")
  .action(async (options) => {
    const registry = await loadRegistry(home);
    const rows = options.kind ? registry.resources.filter((item) => item.kind === options.kind) : registry.resources;
    if (options.json) console.log(JSON.stringify(rows, null, 2));
    else for (const item of rows) console.log(`${item.enabled ? pc.green("✓") : pc.dim("·")} ${item.kind.padEnd(11)} ${item.id.padEnd(24)} targets=${item.targets.join(",")}`);
  });
resourceCommand.command("add")
  .argument("<kind>")
  .argument("<id>")
  .option("--config <json-or-file>", "JSON object or @path")
  .option("--targets <ids>", "comma-separated tool IDs")
  .option("--secret <env=scope[:alias]>", "secret reference", collect, [])
  .option("--disabled")
  .action(async (kind: ResourceKind, id: string, options) => {
    if (!["mcp", "plugin", "integration", "graph"].includes(kind)) throw new Error(`Unknown resource kind: ${kind}`);
    let config: Record<string, unknown>;
    if (options.config) {
      const raw = options.config.startsWith("@") ? await fs.readFile(options.config.slice(1), "utf8") : options.config;
      config = JSON.parse(raw) as Record<string, unknown>;
    } else if (process.stdin.isTTY && kind === "mcp") {
      const type = await select<"local" | "remote">({ message: "MCP transport", choices: [{ name: "Local command", value: "local" }, { name: "Remote URL", value: "remote" }] });
      config = type === "local"
        ? { type, command: await input({ message: "Command" }), args: commaList(await input({ message: "Arguments (comma-separated)", default: "" })) }
        : { type, url: await input({ message: "MCP URL" }) };
    } else {
      const raw = process.stdin.isTTY ? await input({ message: "Resource config JSON", default: "{}" }) : await readStdin();
      config = JSON.parse(raw || "{}") as Record<string, unknown>;
    }
    const targets = options.targets ? parseTools(options.targets) : process.stdin.isTTY
      ? await checkbox<ToolId>({ message: "Targets", choices: adapters.map((item) => ({ name: item.displayName, value: item.id })), required: true })
      : [];
    const secretRefs: ManagedResource["secretRefs"] = {};
    for (const mapping of options.secret as string[]) {
      const [envName, reference] = mapping.split("=", 2);
      if (!envName || !reference) throw new Error(`Invalid --secret mapping: ${mapping}`);
      const separator = reference.lastIndexOf(":");
      const scope = separator > reference.indexOf("/") ? reference.slice(0, separator) : reference;
      const keyAlias = separator > reference.indexOf("/") ? reference.slice(separator + 1) : undefined;
      secretRefs[envName] = { scope, ...(keyAlias ? { keyAlias } : {}) };
    }
    await upsertResource(home, { id, kind, enabled: !options.disabled, targets, config, secretRefs });
    console.log(pc.green(`Saved ${kind} resource ${id}.`));
  });
resourceCommand.command("enable").argument("<kind>").argument("<id>").action(async (kind, id) => { await setResourceEnabled(home, kind, id, true); });
resourceCommand.command("disable").argument("<kind>").argument("<id>").action(async (kind, id) => { await setResourceEnabled(home, kind, id, false); });
resourceCommand.command("remove").argument("<kind>").argument("<id>").action(async (kind, id) => { await removeResource(home, kind, id); });
resourceCommand.command("auth")
  .argument("<id>")
  .requiredOption("--tool <tool>", "codex, codex-app, codex-ide or opencode")
  .option("--logout", "remove the tool-owned MCP OAuth credentials")
  .option("--status", "show MCP authentication status")
  .action(async (id, options) => {
    const registry = await loadRegistry(home);
    const resource = registry.resources.find((item) => item.kind === "mcp" && item.id === id);
    if (!resource) throw new Error(`Unknown MCP resource: ${id}`);
    const tool = String(options.tool) as ToolId;
    if (["codex", "codex-app", "codex-ide"].includes(tool)) {
      const args = options.logout ? ["mcp", "logout", id] : options.status ? ["mcp", "list"] : ["mcp", "login", id];
      process.exitCode = await runInherited("codex", args, {});
      return;
    }
    if (tool === "opencode") {
      const args = options.logout ? ["mcp", "logout", id] : options.status ? ["mcp", "auth", "list"] : ["mcp", "auth", id];
      process.exitCode = await runInherited("opencode", args, {});
      return;
    }
    throw new Error(`MCP OAuth delegation is not implemented for ${tool}`);
  });
resourceCommand.command("apply")
  .option("--targets <ids>", "comma-separated tool IDs", "opencode,kilo,claude,factory,codex,cursor,windsurf,gemini-cli,qwen-code")
  .option("--yes")
  .action(async (options) => {
    const plans = [];
    for (const target of parseTools(options.targets)) plans.push(await planMcpResources(home, target));
    for (const plan of plans) console.log(`${renderPlan(plan)}\n`);
    if (!options.yes && process.stdin.isTTY && !(await confirm({ message: "Apply MCP resource configuration?", default: false }))) return;
    const backup = await applyPlans(plans);
    if (backup) console.log(pc.green(`Applied MCP resources. Backup ${backup}`));
  });

const bundleCommand = program.command("bundle").description("Export/import CPM state for SSH sync");
bundleCommand.command("export")
  .option("--secrets", "include decrypted secrets; use only through a protected pipe")
  .action(async (options) => console.log(JSON.stringify(await createSyncBundle(home, Boolean(options.secrets)))));
bundleCommand.command("import")
  .option("--stdin")
  .option("--file <path>")
  .action(async (options) => {
    const raw = options.file ? await fs.readFile(options.file, "utf8") : await readStdin();
    await importSyncBundle(home, JSON.parse(raw) as SyncBundle);
    console.log(pc.green("Imported CPM sync bundle."));
  });

const syncCommand = program.command("sync").description("Synchronize CPM state over SSH");
syncCommand.command("push")
  .argument("<host>")
  .option("--secrets", "transfer decrypted secrets inside the SSH stdin stream")
  .option("--apply", "apply saved provider configuration on remote")
  .option("--remote-command <command>", "remote CPM executable", "cpm")
  .action(async (host, options) => {
    const bundle = await createSyncBundle(home, Boolean(options.secrets));
    const result = await sshPipe(host, [options.remoteCommand, "bundle", "import", "--stdin"], JSON.stringify(bundle));
    if (result.code !== 0) throw new Error(`Remote import failed with exit code ${result.code}`);
    console.log(pc.green(`Pushed CPM state to ${host}${options.secrets ? " including secrets" : " without secrets"}.`));
    if (options.apply) {
      const applied = await sshPipe(host, [options.remoteCommand, "apply", "--saved", "--yes"]);
      if (applied.code !== 0) throw new Error(`Remote apply failed with exit code ${applied.code}`);
    }
  });
syncCommand.command("pull")
  .argument("<host>")
  .option("--secrets")
  .option("--remote-command <command>", "remote CPM executable", "cpm")
  .action(async (host, options) => {
    const args = [options.remoteCommand, "bundle", "export", ...(options.secrets ? ["--secrets"] : [])];
    const result = await sshPipe(host, args, undefined, true);
    if (result.code !== 0) throw new Error(`Remote export failed: ${result.stderr || `exit ${result.code}`}`);
    await importSyncBundle(home, JSON.parse(result.stdout.trim()) as SyncBundle);
    console.log(pc.green(`Pulled CPM state from ${host}${options.secrets ? " including secrets" : " without secrets"}.`));
  });

const piZaiCommand = program.command("pi-zai").description("Manage the OnlineChefGroep Pi Z.AI extension");
piZaiCommand.command("install").action(async () => {
  process.exitCode = await runInherited("pi", ["install", "npm:@onlinechefgroep/pi-zai"], {});
});
piZaiCommand.command("info").action(() => {
  console.log("pi-zai remains the runtime owner of Z.AI thinking normalization, cache metrics, session affinity and local observability.");
  console.log("CPM only manages provider selection, key slots and the non-secret pi-zai settings surface.");
});

program.command("status")
  .description("Show CPM root paths, dependency readiness and saved preferences")
  .option("--json")
  .action(async (options) => {
    const state = await loadState(home);
    const registry = await loadRegistry(home);
    const paths = resolveRuntimePaths(home);
    const deps = inspectDependencies();
    const tools = detectAdapters(adapters);
    const result = {
      version: "0.4.0",
      paths,
      dependencies: deps,
      nativeUsageProviders: nativeUsageAllowlistLabel().split(", "),
      state: {
        selectedProviders: state.selectedProviders ?? [],
        updatedAt: state.updatedAt,
        providerCount: Object.keys(state.providers).length,
      },
      resources: { total: registry.resources.length, enabled: registry.resources.filter((item) => item.enabled).length },
      tools: {
        total: tools.length,
        installed: tools.filter((item) => item.installed).length,
        rows: tools,
      },
    };
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`CPM 0.4.0  platform=${paths.platform}  node=${paths.node}`);
      console.log(`home=${displayPath(paths.home)}`);
      console.log(`configRoot=${displayPath(paths.configRoot)}`);
      console.log(`cpmRoot=${displayPath(paths.cpmRoot)}`);
      if (paths.appData) console.log(`APPDATA=${displayPath(paths.appData)}`);
      console.log(`bun=${deps.bun.available ? "ok" : "missing"}${deps.bun.path ? ` @ ${deps.bun.path}` : ""}`);
      console.log(`openTui=${deps.openTui.available ? "ok" : "missing"}`);
      console.log(`providers=${state.selectedProviders?.join(",") || "none"}  resources=${result.resources.enabled}/${result.resources.total}  tools=${result.tools.installed}/${result.tools.total}`);
      console.log(`nativeUsage=${nativeUsageAllowlistLabel()}`);
      if (!deps.bun.available && deps.bun.hint) console.log(pc.yellow(deps.bun.hint));
      if (!deps.openTui.available && deps.openTui.hint) console.log(pc.yellow(deps.openTui.hint));
    }
  });

program.command("completion")
  .description("Print shell completion stub (PowerShell recommended on Windows)")
  .argument("[shell]", "powershell | bash | zsh", "powershell")
  .action((shell: string) => {
    const normalized = shell.toLowerCase();
    switch (normalized) {
      case "powershell":
      case "pwsh":
        console.log(powershellCompletionScript("cpm"));
        return;
      case "bash":
      case "zsh":
        console.log(`# Minimal ${normalized} stub — prefer: complete -W "$(cpm --help)" cpm`);
        console.log(`# Full PowerShell completion: cpm completion powershell`);
        return;
      default:
        throw new Error(`Unsupported shell for completion: ${shell}. Use powershell, bash, or zsh.`);
    }
  });

program.command("backups").description("List configuration backups").action(async () => {
  for (const id of await listBackups(home)) console.log(id);
});
program.command("rollback").description("Restore a configuration backup").argument("[id]").action(async (id?: string) => {
  const backups = await listBackups(home);
  const selected = id || backups[0];
  if (!selected) throw new Error("No backup found");
  await rollbackBackup(selected, home);
  console.log(pc.green(`Restored backup ${selected}`));
});

applyCommandHelpGroups(program.commands);

program.parseAsync().catch((error) => {
  console.error(pc.red(formatUserFacingError(error)));
  process.exitCode = 1;
});
