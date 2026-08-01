import path from "node:path";
import type { ProviderSecurityConfig, SecretBackendId } from "./types.js";
import { atomicWrite, readText } from "../core/fs.js";
import { cpmRoot } from "../core/paths.js";

export function providerSecurityRoot(home: string): string {
  return path.join(cpmRoot(home), "provider-security");
}

export function providerSecurityConfigPath(home: string): string {
  return path.join(providerSecurityRoot(home), "config.json");
}

export function defaultProviderSecurityConfig(): ProviderSecurityConfig {
  return {
    schemaVersion: 1,
    fleetMode: false,
    secretBackend: "cpm-local",
    targetRuntime: "opencodex",
    updatedAt: new Date(0).toISOString(),
  };
}

export function normalizeSecretBackend(value: unknown, fleetMode: boolean): SecretBackendId {
  if (fleetMode) return "chefvault";
  if (value === "chefvault" || value === "cpm-local") return value;
  return "cpm-local";
}

export async function loadProviderSecurityConfig(home: string): Promise<ProviderSecurityConfig> {
  const text = await readText(providerSecurityConfigPath(home));
  if (!text.trim()) return defaultProviderSecurityConfig();
  let parsed: Partial<ProviderSecurityConfig>;
  try {
    parsed = JSON.parse(text) as Partial<ProviderSecurityConfig>;
  } catch (error) {
    throw new Error(
      `Invalid provider-security config at ${providerSecurityConfigPath(home)}: ${(error as Error).message}`,
      { cause: error },
    );
  }
  const fleetMode = Boolean(parsed.fleetMode);
  return {
    schemaVersion: 1,
    fleetMode,
    secretBackend: normalizeSecretBackend(parsed.secretBackend, fleetMode),
    targetRuntime: "opencodex",
    chefvaultUrl: parsed.chefvaultUrl?.trim() || undefined,
    updatedAt: parsed.updatedAt ?? new Date(0).toISOString(),
  };
}

export async function saveProviderSecurityConfig(
  home: string,
  config: ProviderSecurityConfig,
): Promise<ProviderSecurityConfig> {
  if (config.fleetMode && config.secretBackend !== "chefvault") {
    throw new Error("fleetMode requires secretBackend=chefvault");
  }
  const persisted: ProviderSecurityConfig = {
    ...config,
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
  };
  await atomicWrite(providerSecurityConfigPath(home), `${JSON.stringify(persisted, null, 2)}\n`);
  return persisted;
}

export function resolveChefVaultSecurityUrl(config: ProviderSecurityConfig): string {
  return (
    config.chefvaultUrl?.trim()
    || process.env.CHEF_PROVIDER_SECURITY_URL?.trim()
    || "http://127.0.0.1:8323"
  );
}

/** Bearer token for protected ChefVault provider-security routes (`/v1/refs/*`). Env is SSOT. */
export function resolveChefVaultSecurityToken(_config?: ProviderSecurityConfig): string | undefined {
  return process.env.CHEF_PROVIDER_SECURITY_TOKEN?.trim() || undefined;
}

/** Optional workload identity headers; only sent when the corresponding env vars are set. */
export function resolveChefVaultIdentityHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const workloadId = process.env.CHEF_WORKLOAD_ID?.trim();
  const hostId = process.env.CHEF_HOST_ID?.trim();
  const actor = process.env.CHEF_ACTOR?.trim();
  if (workloadId) headers["x-chef-workload-id"] = workloadId;
  if (hostId) headers["x-chef-host-id"] = hostId;
  if (actor) headers["x-chef-actor"] = actor;
  return headers;
}
