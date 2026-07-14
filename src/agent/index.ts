import readline from "node:readline";
import type { AgentRequest, AgentResponse, ProviderId } from "../types.js";
import { providers, getProvider } from "../providers/catalog.js";
import { adapters } from "../adapters/index.js";
import { detectAdapters } from "../core/detect.js";
import { loadState, updateProviderPreference } from "../core/state.js";
import { listSecrets, providerScope, rotateSecret, useSecret } from "../core/vault.js";
import { accountDriverSummaries, accountDriverStatus, listDriverAccounts, nextDriverAccount, useDriverAccount } from "../accounts/index.js";
import { fetchUsageTarget, saveUsageCache, selectBestProviderKey } from "../usage/index.js";
import { resolveProviderModels } from "../providers/models.js";
import { loadRegistry } from "../resources/registry.js";

export const agentMethods = [
  "system.status",
  "providers.list",
  "models.list",
  "apps.list",
  "resources.list",
  "keys.list",
  "keys.use",
  "keys.next",
  "keys.best",
  "accounts.drivers",
  "accounts.list",
  "accounts.use",
  "accounts.next",
  "accounts.status",
  "usage.get",
] as const;

export function agentManifest() {
  return {
    protocol: "cpm-jsonl/1",
    agentCompatible: true,
    interactiveRequired: false,
    secretsReturned: false,
    transports: ["single-call", "stdin-jsonl"],
    methods: agentMethods,
  };
}

function requiredString(params: Record<string, unknown>, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`Missing string parameter: ${key}`);
  return value.trim();
}

export async function dispatchAgentRequest(home: string, request: AgentRequest): Promise<AgentResponse> {
  try {
    const params = request.params ?? {};
    let result: unknown;
    switch (request.method) {
      case "system.status": {
        const state = await loadState(home);
        const registry = await loadRegistry(home);
        result = { version: "0.4.0", home, state, resources: { total: registry.resources.length, enabled: registry.resources.filter((item) => item.enabled).length }, tools: detectAdapters(adapters), accountDrivers: accountDriverSummaries() };
        break;
      }
      case "providers.list": {
        const state = await loadState(home);
        result = providers.map((provider) => ({ ...provider, preference: state.providers[provider.id], models: provider.models.length }));
        break;
      }
      case "models.list": {
        const provider = getProvider(requiredString(params, "provider"));
        result = await resolveProviderModels(home, provider);
        break;
      }
      case "apps.list": result = detectAdapters(adapters); break;
      case "resources.list": result = (await loadRegistry(home)).resources; break;
      case "keys.list": {
        const provider = getProvider(requiredString(params, "provider"));
        result = await listSecrets(home, providerScope(provider.id), { [provider.keyEnv]: process.env[provider.keyEnv] });
        break;
      }
      case "keys.use": {
        const provider = getProvider(requiredString(params, "provider"));
        const alias = requiredString(params, "alias");
        await useSecret(home, providerScope(provider.id), alias);
        await updateProviderPreference(home, provider.id, { activeKey: alias });
        result = { provider: provider.id, activeKey: alias };
        break;
      }
      case "keys.next": {
        const provider = getProvider(requiredString(params, "provider"));
        const alias = await rotateSecret(home, providerScope(provider.id));
        await updateProviderPreference(home, provider.id, { activeKey: alias });
        result = { provider: provider.id, activeKey: alias };
        break;
      }
      case "keys.best": {
        const provider = getProvider(requiredString(params, "provider"));
        const best = await selectBestProviderKey(home, provider);
        await updateProviderPreference(home, provider.id, { activeKey: best.alias });
        await saveUsageCache(home, [best]);
        result = best;
        break;
      }
      case "accounts.drivers": result = accountDriverSummaries(); break;
      case "accounts.list": result = await listDriverAccounts(requiredString(params, "driver")); break;
      case "accounts.use": {
        const driver = requiredString(params, "driver");
        const selector = requiredString(params, "selector");
        await useDriverAccount(driver, selector);
        result = { driver, active: selector };
        break;
      }
      case "accounts.next": result = await nextDriverAccount(requiredString(params, "driver")); break;
      case "accounts.status": result = await accountDriverStatus(requiredString(params, "driver")); break;
      case "usage.get": {
        const target = requiredString(params, "target");
        const values = await fetchUsageTarget(home, target, { allKeys: params.allKeys === true, alias: typeof params.alias === "string" ? params.alias : undefined });
        await saveUsageCache(home, values);
        result = values;
        break;
      }
      default: return { ...(request.id !== undefined ? { id: request.id } : {}), ok: false, error: { code: "METHOD_NOT_FOUND", message: `Unknown method: ${request.method}` } };
    }
    return { ...(request.id !== undefined ? { id: request.id } : {}), ok: true, result };
  } catch (error) {
    return { ...(request.id !== undefined ? { id: request.id } : {}), ok: false, error: { code: "CPM_ERROR", message: (error as Error).message } };
  }
}

export async function serveAgentJsonl(home: string): Promise<void> {
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity, terminal: false });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let request: AgentRequest;
    try { request = JSON.parse(line) as AgentRequest; }
    catch (error) {
      process.stdout.write(`${JSON.stringify({ ok: false, error: { code: "INVALID_JSON", message: (error as Error).message } })}\n`);
      continue;
    }
    process.stdout.write(`${JSON.stringify(await dispatchAgentRequest(home, request))}\n`);
  }
}
