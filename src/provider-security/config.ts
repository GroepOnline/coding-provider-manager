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
