import path from "node:path";
import type { ProviderId, ProviderProfile, UsageResult } from "../types.js";
import { atomicWrite, readText } from "../core/fs.js";
import { cpmRoot } from "../core/paths.js";
import { listSecrets, providerScope, resolveSecret, useSecret } from "../core/vault.js";
import { accountDrivers, accountDriverUsage } from "../accounts/index.js";
import { getProvider } from "../providers/catalog.js";

interface UsageCache {
  schemaVersion: 1;
  updatedAt: string;
  results: UsageResult[];
}

function cachePath(home: string): string {
  return path.join(cpmRoot(home), "usage-cache.json");
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  try { return JSON.parse(text) as unknown; } catch { return { text }; }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numberAt(value: unknown, keys: string[]): number | undefined {
  const root = record(value);
  if (!root) return undefined;
  for (const key of keys) {
    const item = root[key];
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if (typeof item === "string" && Number.isFinite(Number(item))) return Number(item);
  }
  for (const nested of Object.values(root)) {
    const found = numberAt(nested, keys);
    if (found !== undefined) return found;
  }
  return undefined;
}

function resultsAt(value: unknown, key: string): unknown[] {
  const root = record(value);
  if (!root) return [];
  if (Array.isArray(root[key])) return root[key] as unknown[];
  const data = record(root.data);
  return Array.isArray(data?.[key]) ? data![key] as unknown[] : [];
}

async function request(url: string, key: string, authorization = `Bearer ${key}`): Promise<{ ok: boolean; status: number; data: unknown }> {
  const response = await fetch(url, {
    headers: { Authorization: authorization, Accept: "application/json", "Content-Type": "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  return { ok: response.ok, status: response.status, data: await readJsonResponse(response) };
}

async function openRouterUsage(key: string, alias?: string): Promise<UsageResult> {
  const response = await request("https://openrouter.ai/api/v1/key", key);
  if (!response.ok) throw new Error(`OpenRouter usage HTTP ${response.status}`);
  const remaining = numberAt(response.data, ["limit_remaining", "remaining", "limitRemaining"]);
  const usage = numberAt(response.data, ["usage", "usage_monthly", "usageMonthly"]);
  return {
    target: "openrouter",
    alias,
    source: "provider",
    available: true,
    fetchedAt: new Date().toISOString(),
    summary: remaining !== undefined ? `OpenRouter remaining ${remaining}` : usage !== undefined ? `OpenRouter usage ${usage}` : "OpenRouter key usage available",
    ...(remaining !== undefined ? { score: remaining } : {}),
    data: response.data,
  };
}

async function deepSeekUsage(key: string, alias?: string): Promise<UsageResult> {
  const response = await request("https://api.deepseek.com/user/balance", key);
  if (!response.ok) throw new Error(`DeepSeek balance HTTP ${response.status}`);
  const balances = resultsAt(response.data, "balance_infos");
  const total = balances.reduce<number>((sum, item) => sum + (numberAt(item, ["total_balance"]) ?? 0), 0);
  const available = record(response.data)?.is_available;
  return {
    target: "deepseek",
    alias,
    source: "provider",
    available: available !== false,
    fetchedAt: new Date().toISOString(),
    summary: balances.length ? `DeepSeek balance ${total}` : "DeepSeek balance available",
    score: total,
    data: response.data,
  };
}

async function zaiUsage(provider: ProviderProfile, key: string, alias?: string): Promise<UsageResult> {
  const base = new URL(provider.openAIBaseUrl ?? "https://api.z.ai").origin;
  const url = `${base}/api/monitor/usage/quota/limit`;
  let last: { ok: boolean; status: number; data: unknown } | undefined;
  for (const authorization of [key, `Bearer ${key}`]) {
    last = await request(url, key, authorization);
    if (last.ok) break;
  }
  if (!last?.ok) throw new Error(`Z.AI quota HTTP ${last?.status ?? "unknown"}`);
  const root = record(last.data);
  const data = record(root?.data) ?? root;
  const limits = Array.isArray(data?.limits) ? data!.limits as unknown[] : [];
  const percentages = limits.map((item) => numberAt(item, ["percentage"])).filter((item): item is number => item !== undefined);
  const worst = percentages.length ? Math.max(...percentages) : undefined;
  const reset = limits.map((item) => numberAt(item, ["nextResetTime"])).filter((item): item is number => item !== undefined).sort((a, b) => a - b)[0];
  return {
    target: provider.id,
    alias,
    source: "provider",
    available: true,
    fetchedAt: new Date().toISOString(),
    summary: worst !== undefined ? `Z.AI quota highest window ${worst}% used` : "Z.AI Coding Plan quota available",
    ...(worst !== undefined ? { score: 100 - worst } : {}),
    ...(reset ? { resetAt: new Date(reset).toISOString() } : {}),
    data: last.data,
  };
}

/** MiniMax Token/Coding Plan remains — same Bearer + GET pattern as DeepSeek/Z.AI. */
async function minimaxUsage(provider: ProviderProfile, key: string, alias?: string): Promise<UsageResult> {
  const base = new URL(provider.openAIBaseUrl ?? "https://api.minimax.io/v1").origin;
  const url = `${base}/v1/api/openplatform/coding_plan/remains`;
  const response = await request(url, key);
  if (!response.ok) throw new Error(`MiniMax quota HTTP ${response.status}`);
  const root = record(response.data);
  const baseResp = record(root?.base_resp);
  const statusCode = numberAt(baseResp, ["status_code"]);
  if (statusCode !== undefined && statusCode !== 0) {
    const msg = typeof baseResp?.status_msg === "string" ? baseResp.status_msg : `status ${statusCode}`;
    throw new Error(`MiniMax quota error: ${msg}`);
  }
  const remains = resultsAt(response.data, "model_remains");
  const first = remains[0];
  const interval = numberAt(first, ["current_interval_remaining_percent"]);
  const weekly = numberAt(first, ["current_weekly_remaining_percent"]);
  const remaining = [interval, weekly].filter((item): item is number => item !== undefined);
  const worstRemaining = remaining.length ? Math.min(...remaining) : undefined;
  const endMs = numberAt(first, ["end_time"]) ?? numberAt(first, ["weekly_end_time"]);
  const resetAt = endMs !== undefined
    ? new Date(endMs > 1e12 ? endMs : endMs * 1000).toISOString()
    : undefined;
  return {
    target: provider.id,
    alias,
    source: "provider",
    available: true,
    fetchedAt: new Date().toISOString(),
    summary: worstRemaining !== undefined
      ? `MiniMax quota lowest remaining window ${worstRemaining}%`
      : "MiniMax Coding Plan quota available",
    ...(worstRemaining !== undefined ? { score: worstRemaining } : {}),
    ...(resetAt ? { resetAt } : {}),
    data: response.data,
  };
}

/** Providers with a verified public usage/balance/quota API. Do not invent adapters for the rest. */
export const NATIVE_USAGE_PROVIDER_IDS = ["openrouter", "deepseek", "zai-coding", "minimax"] as const satisfies readonly ProviderId[];

export type NativeUsageProviderId = (typeof NATIVE_USAGE_PROVIDER_IDS)[number];

export interface NativeUsageSupportMatrix {
  supported: readonly NativeUsageProviderId[];
  endpoints: Record<NativeUsageProviderId, string>;
  nextSteps: string[];
}

const NATIVE_USAGE_ENDPOINTS = {
  openrouter: "GET https://openrouter.ai/api/v1/key",
  deepseek: "GET https://api.deepseek.com/user/balance",
  "zai-coding": "GET https://api.z.ai/api/monitor/usage/quota/limit",
  minimax: "GET https://api.minimax.io/v1/api/openplatform/coding_plan/remains",
} as const satisfies Record<NativeUsageProviderId, string>;

export function providerSupportsNativeUsage(id: ProviderId): id is NativeUsageProviderId {
  return (NATIVE_USAGE_PROVIDER_IDS as readonly string[]).includes(id);
}

export function nativeUsageAllowlistLabel(): string {
  return NATIVE_USAGE_PROVIDER_IDS.join(", ");
}

/** Structured support matrix for doctor / usage / status JSON consumers. */
export function nativeUsageSupportMatrix(): NativeUsageSupportMatrix {
  return {
    supported: NATIVE_USAGE_PROVIDER_IDS,
    endpoints: { ...NATIVE_USAGE_ENDPOINTS },
    nextSteps: [
      `Fetch quota: cpm usage <${NATIVE_USAGE_PROVIDER_IDS.join("|")}> --json`,
      `Pick highest remaining key: cpm key best <provider> (native usage only)`,
      "Providers without a verified public usage API: use cpm key next <provider> or cpm key use <provider> <alias>",
      "OpenAI org usage/costs require an Admin API key — not supported with a normal OPENAI_API_KEY",
      "Account pools (Codex / OpenCode / GitHub): cpm accounts usage",
    ],
  };
}

export function unsupportedNativeUsageMessage(provider: ProviderProfile): string {
  return `${provider.displayName} has no verified public account usage endpoint. Native usage / key best is supported for: ${nativeUsageAllowlistLabel()}. Use \`cpm key next ${provider.id}\` or \`cpm key use ${provider.id} <alias>\` to switch keys without quota scoring.`;
}

export function unsupportedKeyBestMessage(provider: ProviderProfile): string {
  return `key best requires native usage for ${provider.id}. Supported providers: ${nativeUsageAllowlistLabel()}. Fallback: \`cpm key next ${provider.id}\` or \`cpm key use ${provider.id} <alias>\`.`;
}

export async function fetchProviderUsage(
  home: string,
  providerOrId: ProviderProfile | ProviderId,
  alias?: string,
): Promise<UsageResult> {
  const provider = typeof providerOrId === "string" ? getProvider(providerOrId) : providerOrId;
  if (!providerSupportsNativeUsage(provider.id)) {
    return {
      target: provider.id,
      alias,
      source: "provider",
      available: false,
      fetchedAt: new Date().toISOString(),
      summary: unsupportedNativeUsageMessage(provider),
      error: "native-usage-unsupported",
    };
  }
  try {
    const secret = await resolveSecret(home, providerScope(provider.id), alias, provider.keyEnv);
    switch (provider.id) {
      case "openrouter":
        return await openRouterUsage(secret.value, secret.alias);
      case "deepseek":
        return await deepSeekUsage(secret.value, secret.alias);
      case "zai-coding":
        return await zaiUsage(provider, secret.value, secret.alias);
      case "minimax":
        return await minimaxUsage(provider, secret.value, secret.alias);
      default: {
        const _exhaustive: never = provider.id;
        throw new Error(`Unhandled native usage provider: ${_exhaustive}`);
      }
    }
  } catch (error) {
    return { target: provider.id, alias, source: "provider", available: false, fetchedAt: new Date().toISOString(), summary: `${provider.displayName} usage unavailable`, error: (error as Error).message };
  }
}

export async function fetchAllProviderKeyUsage(home: string, providerOrId: ProviderProfile | ProviderId): Promise<UsageResult[]> {
  const provider = typeof providerOrId === "string" ? getProvider(providerOrId) : providerOrId;
  const slots = (await listSecrets(home, providerScope(provider.id), { [provider.keyEnv]: process.env[provider.keyEnv] }))
    .filter((item) => !item.disabled);
  if (!slots.length) return [await fetchProviderUsage(home, provider)];
  const results: UsageResult[] = [];
  for (const slot of slots) results.push(await fetchProviderUsage(home, provider, slot.source === "environment" ? undefined : slot.alias));
  return results;
}

export async function selectBestProviderKey(home: string, providerOrId: ProviderProfile | ProviderId): Promise<UsageResult> {
  const provider = typeof providerOrId === "string" ? getProvider(providerOrId) : providerOrId;
  if (!providerSupportsNativeUsage(provider.id)) {
    throw new Error(unsupportedKeyBestMessage(provider));
  }
  const results = await fetchAllProviderKeyUsage(home, provider);
  const candidates = results.filter((item) => item.available && item.alias && item.alias !== "environment");
  if (!candidates.length) {
    const hint = results.find((item) => item.error)?.error;
    throw new Error(
      `No usable key usage result for ${provider.id}. Ensure at least two named vault key slots exist and usage endpoints succeed.`
      + (hint ? ` Last error: ${hint}` : "")
      + ` Fallback: \`cpm key next ${provider.id}\`.`,
    );
  }
  const best = [...candidates].sort((a, b) => (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY))[0]!;
  await useSecret(home, providerScope(provider.id), best.alias!);
  return best;
}

export async function fetchUsageTarget(home: string, target: string, options: { allKeys?: boolean; alias?: string } = {}): Promise<UsageResult[]> {
  if (accountDrivers.some((driver) => driver.id === target)) {
    return [await accountDriverUsage(target)];
  }
  const provider = getProvider(target);
  return options.allKeys ? await fetchAllProviderKeyUsage(home, provider) : [await fetchProviderUsage(home, provider, options.alias)];
}

export async function saveUsageCache(home: string, results: UsageResult[]): Promise<void> {
  const current = await loadUsageCache(home);
  const key = (item: UsageResult) => `${item.target}:${item.alias ?? "default"}`;
  const merged = new Map(current.results.map((item) => [key(item), item]));
  for (const result of results) merged.set(key(result), result);
  const payload: UsageCache = { schemaVersion: 1, updatedAt: new Date().toISOString(), results: [...merged.values()] };
  await atomicWrite(cachePath(home), `${JSON.stringify(payload, null, 2)}\n`);
}

export async function loadUsageCache(home: string): Promise<UsageCache> {
  const text = await readText(cachePath(home));
  if (!text.trim()) return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), results: [] };
  try {
    const parsed = JSON.parse(text) as UsageCache;
    return { schemaVersion: 1, updatedAt: parsed.updatedAt ?? new Date(0).toISOString(), results: parsed.results ?? [] };
  } catch {
    return { schemaVersion: 1, updatedAt: new Date(0).toISOString(), results: [] };
  }
}
