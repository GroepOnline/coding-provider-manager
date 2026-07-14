import { adapters, adapterMap } from "../adapters/index.js";
import { atomicWrite } from "../core/fs.js";
import { createBackup, rollbackBackup } from "../core/backup.js";
import { loadState, updateProviderPreference } from "../core/state.js";
import { createSyncBundle } from "../core/sync.js";
import {
  addSecret,
  fingerprintSecret,
  listSecrets,
  providerScope,
  resolveSecret,
} from "../core/vault.js";
import { getProvider } from "../providers/catalog.js";
import { fetchProviderModels, probeProvider, resolveProviderModels } from "../providers/models.js";
import { planMcpResources } from "../resources/apply.js";
import { loadRegistry } from "../resources/registry.js";
import { nativeUsageSupportMatrix, providerSupportsNativeUsage } from "../usage/index.js";
import type {
  AdapterContext,
  PlannedChange,
  ProviderId,
  ProviderProfile,
  ToolId,
} from "../types.js";

function optionalString(params: Record<string, unknown>, key: string): string | undefined {
  const value = params[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`Parameter ${key} must be a string`);
  const trimmed = value.trim();
  return trimmed || undefined;
}

function requiredString(params: Record<string, unknown>, key: string): string {
  const value = optionalString(params, key);
  if (!value) throw new Error(`Missing string parameter: ${key}`);
  return value;
}

function optionalBoolean(params: Record<string, unknown>, key: string): boolean {
  return params[key] === true;
}

function commaList(value?: string): string[] {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

export function parseTools(value: string | undefined, provider?: ProviderProfile): ToolId[] {
  if (!value || value === "default") return provider?.defaultTools ?? ["opencode", "factory", "kilo", "crush"];
  if (value === "all") return (provider?.allowedTools ?? adapters.map((item) => item.id)).filter((id) => adapterMap.has(id));
  const result = commaList(value) as ToolId[];
  for (const id of result) if (!adapterMap.has(id)) throw new Error(`Unknown tool: ${id}`);
  return result;
}

async function activeProviderId(home: string, explicit?: string): Promise<ProviderId> {
  if (explicit) return getProvider(explicit).id;
  const state = await loadState(home);
  return state.selectedProviders?.[0] ?? "zai-coding";
}

async function buildContext(
  home: string,
  provider: ProviderProfile,
  options: { model?: string; discover?: boolean; makeDefault?: boolean; keyAlias?: string } = {},
): Promise<AdapterContext> {
  const state = await loadState(home);
  const preference = state.providers[provider.id] ?? {};
  let key: string | undefined;
  if (options.discover) {
    try {
      key = (await resolveSecret(home, providerScope(provider.id), options.keyAlias, provider.keyEnv)).value;
    } catch {
      key = undefined;
    }
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

async function plansForProvider(
  home: string,
  provider: ProviderProfile,
  options: { tools?: string; model?: string; discover?: boolean; makeDefault?: boolean; keyAlias?: string },
): Promise<{ ctx: AdapterContext; plans: PlannedChange[]; tools: ToolId[] }> {
  const ctx = await buildContext(home, provider, options);
  const state = await loadState(home);
  const savedTools = state.providers[provider.id]?.selectedTools;
  const tools = options.tools ? parseTools(options.tools, provider) : savedTools?.length ? savedTools : parseTools("default", provider);
  const plans: PlannedChange[] = [];
  for (const id of tools) plans.push(await adapterMap.get(id)!.plan(ctx));
  return { ctx, plans, tools };
}

export async function applyPlannedChanges(
  plans: Array<{ status: string; path?: string; after?: string }>,
  home: string,
): Promise<string | undefined> {
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
  const backupId = await createBackup(writable.map((item) => item.path), home);
  try {
    for (const item of writable) await atomicWrite(item.path, item.after);
    return backupId;
  } catch (error) {
    await rollbackBackup(backupId, home);
    throw new Error(`Apply failed and was rolled back: ${(error as Error).message}`);
  }
}

function summarizePlan(plan: PlannedChange): Record<string, unknown> {
  return {
    tool: plan.tool,
    status: plan.status,
    path: plan.path,
    notes: plan.notes,
    changed: plan.status === "ready" && plan.after !== undefined && plan.after !== (plan.before ?? ""),
  };
}

export async function planPreview(home: string, params: Record<string, unknown>): Promise<unknown> {
  const state = await loadState(home);
  const saved = optionalBoolean(params, "saved");
  const tools = optionalString(params, "tools");
  const model = optionalString(params, "model");
  const discover = optionalBoolean(params, "discover");
  const makeDefault = optionalBoolean(params, "makeDefault");
  const targets = saved
    ? (state.selectedProviders ?? []).map((id) => getProvider(id))
    : [getProvider(await activeProviderId(home, optionalString(params, "provider")))];
  const results = [];
  for (const provider of targets) {
    const { plans } = await plansForProvider(home, provider, { tools, model, discover, makeDefault });
    results.push({
      provider: provider.id,
      plans: plans.map(summarizePlan),
    });
  }
  return { providers: results };
}

export async function applyExecute(home: string, params: Record<string, unknown>): Promise<unknown> {
  const state = await loadState(home);
  const saved = optionalBoolean(params, "saved");
  const toolsOpt = optionalString(params, "tools");
  const model = optionalString(params, "model");
  const discover = optionalBoolean(params, "discover");
  const makeDefault = optionalBoolean(params, "makeDefault");
  const withResources = optionalBoolean(params, "resources");
  const targets = saved
    ? (state.selectedProviders ?? []).map((id) => getProvider(id))
    : [getProvider(await activeProviderId(home, optionalString(params, "provider")))];
  const applied = [];
  for (const provider of targets) {
    const { plans, tools } = await plansForProvider(home, provider, {
      tools: toolsOpt,
      model,
      discover,
      makeDefault,
    });
    const backup = await applyPlannedChanges(plans, home);
    let resourceBackup: string | undefined;
    const resourcePlans: PlannedChange[] = [];
    if (withResources) {
      const resourceTools = toolsOpt
        ? parseTools(toolsOpt, provider)
        : state.providers[provider.id]?.selectedTools ?? provider.defaultTools ?? tools;
      for (const tool of resourceTools) resourcePlans.push(await planMcpResources(home, tool));
      resourceBackup = await applyPlannedChanges(resourcePlans, home);
    }
    applied.push({
      provider: provider.id,
      backup,
      plans: plans.map(summarizePlan),
      ...(withResources
        ? { resources: { backup: resourceBackup, plans: resourcePlans.map(summarizePlan) } }
        : {}),
    });
  }
  return { applied };
}

export async function doctorRun(home: string, params: Record<string, unknown>): Promise<unknown> {
  const provider = getProvider(await activeProviderId(home, optionalString(params, "provider")));
  const model = optionalString(params, "model");
  const keyAlias = optionalString(params, "alias") ?? optionalString(params, "key");
  const allKeys = optionalBoolean(params, "allKeys");
  const probe = optionalBoolean(params, "probe");
  const summaries = allKeys
    ? (await listSecrets(home, providerScope(provider.id))).filter((item) => !item.disabled && item.source === "vault")
    : [{ alias: keyAlias }];
  const results = [];
  for (const summary of summaries) {
    const alias = summary.alias;
    const key = (await resolveSecret(home, providerScope(provider.id), alias, provider.keyEnv)).value;
    const entry = await fetchProviderModels(home, provider, key);
    const selectedId = model
      ?? (await loadState(home)).providers[provider.id]?.defaultModel
      ?? provider.defaultModel
      ?? entry.models[0]?.id;
    const selected = entry.models.find((item) => item.id === selectedId) ?? entry.models[0];
    if (!selected) throw new Error(`No models for ${provider.id}`);
    const modelListingFallback = entry.source.some((source) => source.startsWith("fetch-fallback:"));
    await probeProvider(provider, key, selected);
    const probes: string[] = ["auth"];
    if (probe) {
      await probeProvider(provider, key, selected, { streaming: true });
      probes.push("streaming");
      if (selected.toolCall !== false) {
        await probeProvider(provider, key, selected, { toolCall: true });
        probes.push("toolCall");
      }
    }
    results.push({
      provider: provider.id,
      alias: alias ?? "active",
      model: selected.id,
      models: entry.models.length,
      modelListingFallback,
      nativeUsageSupported: providerSupportsNativeUsage(provider.id),
      probes,
      ok: true,
    });
  }
  return { results, nativeUsage: nativeUsageSupportMatrix() };
}

export async function keysAdd(home: string, params: Record<string, unknown>): Promise<unknown> {
  const provider = getProvider(requiredString(params, "provider"));
  const alias = optionalString(params, "alias") ?? "default";
  const inactive = optionalBoolean(params, "inactive");
  const fromEnv = optionalBoolean(params, "fromEnv");
  let value: string | undefined;
  if (fromEnv) {
    value = process.env[provider.keyEnv]?.trim();
    if (!value) throw new Error(`${provider.keyEnv} is not set`);
  } else {
    value = requiredString(params, "value");
  }
  await addSecret(home, providerScope(provider.id), alias, value, !inactive);
  if (!inactive) await updateProviderPreference(home, provider.id, { activeKey: alias });
  return {
    provider: provider.id,
    alias,
    active: !inactive,
    fingerprint: fingerprintSecret(value),
  };
}

export async function syncStatus(home: string): Promise<unknown> {
  const bundle = await createSyncBundle(home, false);
  const registry = await loadRegistry(home);
  const secrets = await listSecrets(home);
  const vaultScopes = new Set(secrets.filter((item) => item.source === "vault").map((item) => item.scope));
  return {
    schemaVersion: bundle.schemaVersion,
    exportedAt: bundle.exportedAt,
    home,
    stateUpdatedAt: bundle.state.updatedAt,
    selectedProviders: bundle.state.selectedProviders ?? [],
    providersConfigured: Object.keys(bundle.state.providers).length,
    resources: {
      total: registry.resources.length,
      enabled: registry.resources.filter((item) => item.enabled).length,
    },
    secretScopes: vaultScopes.size,
    secretsIncluded: false,
    pullRequiresHost: true,
  };
}
