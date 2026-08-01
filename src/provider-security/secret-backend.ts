import type { ProviderSecurityConfig, SecretBackendId } from "./types.js";
import { assertFleetBackend } from "./policy-schema.js";
import { ChefVaultProviderSecurityClient } from "./chefvault-client.js";
import {
  addSecret,
  listSecrets,
  providerScope,
  removeSecret,
  resolveSecret,
  rotateSecret,
  setSecretDisabled,
  useSecret,
} from "../core/vault.js";

export interface ResolvedManagedSecret {
  value: string;
  alias: string;
  source: "chefvault" | "vault" | "environment";
  ref?: string;
}

export interface SecretBackendSummary {
  id: SecretBackendId;
  fleetMode: boolean;
  allowsLocalFallback: boolean;
}

export function secretBackendSummary(config: ProviderSecurityConfig): SecretBackendSummary {
  assertFleetBackend(config);
  return {
    id: config.secretBackend,
    fleetMode: config.fleetMode,
    allowsLocalFallback: !config.fleetMode && config.secretBackend === "cpm-local",
  };
}

export function forbidLocalFallback(config: ProviderSecurityConfig): void {
  if (config.fleetMode && config.secretBackend !== "chefvault") {
    throw new Error("fleetMode forbids local encrypted vault fallback; set secretBackend=chefvault");
  }
}

export async function resolveManagedSecret(
  home: string,
  config: ProviderSecurityConfig,
  scope: string,
  alias?: string,
  environmentVariable?: string,
): Promise<ResolvedManagedSecret> {
  forbidLocalFallback(config);

  if (config.secretBackend === "chefvault") {
    const client = new ChefVaultProviderSecurityClient(config);
    const ref = `chefvault://pools/${scope.replace(/^provider\//, "")}/${alias ?? "active"}`;
    const status = await client.inspectRef(ref);
    if (!status.ok) {
      if (config.fleetMode) {
        throw new Error(`ChefVault ref unavailable in fleet mode (${status.error ?? "unknown"}) — local vault fallback is forbidden`);
      }
      throw new Error(status.error ?? `ChefVault ref unavailable: ${ref}`);
    }
    if (environmentVariable && process.env[environmentVariable]?.trim()) {
      if (config.fleetMode) {
        throw new Error(`Environment fallback for ${environmentVariable} is forbidden in fleet mode`);
      }
      return {
        value: process.env[environmentVariable]!.trim(),
        alias: "environment",
        source: "environment",
      };
    }
    throw new Error(
      "ChefVault secret backend resolves refs only; materialize leases through OpenCodex runtime (PSP-008)",
    );
  }

  const resolved = await resolveSecret(home, scope, alias, environmentVariable);
  return {
    value: resolved.value,
    alias: resolved.alias,
    source: resolved.source === "vault" ? "vault" : "environment",
  };
}

export {
  addSecret,
  listSecrets,
  providerScope,
  removeSecret,
  resolveSecret,
  rotateSecret,
  setSecretDisabled,
  useSecret,
};
