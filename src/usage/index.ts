import path from "node:path";
import type { ProviderId, ProviderProfile, UsageResult } from "../types.js";
import { atomicWrite, readText } from "../core/fs.js";
import { cpmRoot } from "../core/paths.js";
import { listSecrets, providerScope, resolveSecret, useSecret } from "../core/vault.js";
import { accountDriverUsage } from "../accounts/index.js";
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

export function providerSupportsNativeUsage(id: ProviderId): boolean {
  return id === "openrouter" || id === "deepseek" || id === "zai-coding";
}

export async function fetchProviderUsage(
  home: string,
  providerOrId: ProviderProfile | ProviderId,
  alias?: string,
): Promise<UsageResult> {
  const provider = typeof providerOrId === "string" ? getProvider(providerOrId) : providerOrId;
  if (!providerSupportsNativeUsage(provider.id)) {
    return { target: provider.id, alias, source: "provider", available: false, fetchedAt: new Date().toISOString(), summary: `${provider.displayName} has no verified public account usage endpoint` };
  }
  try {
    const secret = await resolveSecret(home, providerScope(provider.id), alias, provider.keyEnv);
    if (provider.id === "openrouter") return await openRouterUsage(secret.value, secret.alias);
    if (provider.id === "deepseek") return await deepSeekUsage(secret.value, secret.alias);
    return await zaiUsage(provider, secret.value, secret.alias);
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
  const results = await fetchAllProviderKeyUsage(home, provider);
  const candidates = results.filter((item) => item.available && item.alias && item.alias !== "environment");
  if (!candidates.length) throw new Error(`No usable key usage result for ${provider.id}`);
  const best = [...candidates].sort((a, b) => (b.score ?? Number.NEGATIVE_INFINITY) - (a.score ?? Number.NEGATIVE_INFINITY))[0]!;
  await useSecret(home, providerScope(provider.id), best.alias!);
  return best;
}

export async function fetchUsageTarget(home: string, target: string, options: { allKeys?: boolean; alias?: string } = {}): Promise<UsageResult[]> {
  if (["codex-multi-auth", "opencode-codex-multi-auth", "github"].includes(target)) {
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
