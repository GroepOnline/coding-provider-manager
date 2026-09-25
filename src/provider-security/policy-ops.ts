import fs from "node:fs/promises";
import path from "node:path";
import type {
  DesiredPolicyDocument,
  PolicyApplyResult,
  PolicyDoctorResult,
  PolicyPlanResult,
  PolicyValidationIssue,
  PolicyValidationResult,
  ProviderPoolPolicy,
  ProviderSecurityConfig,
} from "./types.js";
import { configRoot } from "../core/paths.js";
import { atomicWrite, pathExists, readText } from "../core/fs.js";
import { createBackup, listBackups } from "../core/backup.js";
import { loadState } from "../core/state.js";
import { providers, getProvider } from "../providers/catalog.js";
import { listSecrets, providerScope } from "../core/vault.js";
import { loadProviderSecurityConfig, providerSecurityRoot, saveProviderSecurityConfig } from "./config.js";
import { ChefVaultProviderSecurityClient } from "./chefvault-client.js";
import { chefVaultRef, cpmLocalRef, validateDesiredPolicy } from "./policy-schema.js";
import { forbidLocalFallback } from "./secret-backend.js";

function revisionId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function opencodexPolicyPath(home: string): string {
  return path.join(configRoot(home), "opencodex", "provider-policy.json");
}

function revisionsDir(home: string): string {
  return path.join(providerSecurityRoot(home), "revisions");
}

function revisionPath(home: string, revision: string): string {
  return path.join(revisionsDir(home), `${revision}.json`);
}

function activePointerPath(home: string): string {
  return path.join(providerSecurityRoot(home), "active.json");
}

function defaultPoolLimits(providerId: string): Pick<ProviderPoolPolicy, "weight" | "rpm" | "concurrency" | "budgetUsd" | "fallbackCap"> {
  return {
    weight: 100,
    rpm: providerId.includes("openrouter") ? 120 : 60,
    concurrency: 4,
    budgetUsd: 50,
    fallbackCap: 2,
  };
}

async function buildPoolPolicy(
  home: string,
  config: ProviderSecurityConfig,
  state: Awaited<ReturnType<typeof loadState>>,
  providerId: ProviderPoolPolicy["providerId"],
): Promise<ProviderPoolPolicy | undefined> {
  const preference = state.providers[providerId];
  if (!preference?.enabled && !(state.selectedProviders ?? []).includes(providerId)) return undefined;

  const scope = providerScope(providerId);
  const keys = await listSecrets(home, scope);
  const active = keys.find((item) => item.active && !item.disabled)?.alias ?? preference?.activeKey ?? "default";
  const limits = defaultPoolLimits(providerId);

  const credentialRef = config.secretBackend === "chefvault"
    ? chefVaultRef(`pools/${providerId}`, active)
    : cpmLocalRef(scope, active);

  return {
    providerId,
    enabled: preference?.enabled !== false,
    credentialRef,
    ...limits,
  };
}

/** Probe every chefvault:// ref so a policy can never point at a credential the service cannot resolve. */
async function unresolvedChefVaultRefs(
  config: ProviderSecurityConfig,
  pools: ProviderPoolPolicy[],
): Promise<PolicyValidationIssue[]> {
  if (config.secretBackend !== "chefvault") return [];
  const client = new ChefVaultProviderSecurityClient(config);
  const issues: PolicyValidationIssue[] = [];
  for (const pool of pools) {
    if (!pool.credentialRef.startsWith("chefvault://")) continue;
    const status = await client.inspectRef(pool.credentialRef);
    if (status.ok) continue;
    issues.push({
      code: "chefvault-ref-unresolved",
      message: `ChefVault cannot resolve ${status.ref} for ${pool.providerId}${status.error ? `: ${status.error}` : ""}`,
      path: `pools.${pool.providerId}.credentialRef`,
    });
  }
  return issues;
}

export async function planDesiredPolicy(home: string, config?: ProviderSecurityConfig): Promise<PolicyPlanResult> {
  const resolvedConfig = config ?? await loadProviderSecurityConfig(home);
  forbidLocalFallback(resolvedConfig);

  const pools: ProviderPoolPolicy[] = [];
  const state = await loadState(home);
  const targetIds = state.selectedProviders?.length
    ? state.selectedProviders
    : providers.map((item) => item.id);

  for (const providerId of targetIds) {
    try {
      getProvider(providerId);
    } catch {
      continue;
    }
    const pool = await buildPoolPolicy(home, resolvedConfig, state, providerId);
    if (pool) pools.push(pool);
  }

  const draft: DesiredPolicyDocument = {
    schemaVersion: 1,
    revision: revisionId(),
    fleetMode: resolvedConfig.fleetMode,
    secretBackend: resolvedConfig.secretBackend,
    targetRuntime: "opencodex",
    pools,
    issuedAt: new Date().toISOString(),
  };

  const targetPath = opencodexPolicyPath(home);
  const changes = [
    `Render ${pools.length} provider pool(s) for OpenCodex`,
    `Secret backend: ${resolvedConfig.secretBackend}${resolvedConfig.fleetMode ? " (fleet)" : ""}`,
    `Target: ${targetPath}`,
  ];

  const unresolvedRefs = await unresolvedChefVaultRefs(resolvedConfig, pools);

  return {
    config: resolvedConfig,
    draft,
    targetPath,
    changes,
    unresolvedRefs,
    warnings: unresolvedRefs.map((item) => item.message),
  };
}

export async function validateDesiredPolicyFile(
  home: string,
  policy: DesiredPolicyDocument,
  config?: ProviderSecurityConfig,
): Promise<PolicyValidationResult> {
  const resolvedConfig = config ?? await loadProviderSecurityConfig(home);
  forbidLocalFallback(resolvedConfig);
  return validateDesiredPolicy(policy, resolvedConfig);
}

export async function applyDesiredPolicy(
  home: string,
  draft?: DesiredPolicyDocument,
  options: { yes?: boolean } = {},
): Promise<PolicyApplyResult> {
  if (!options.yes) {
    throw new Error("Refusing to apply provider policy without confirmation (pass --yes or confirm interactively)");
  }

  const config = await loadProviderSecurityConfig(home);
  forbidLocalFallback(config);
  const plan = draft ? { config, draft, targetPath: opencodexPolicyPath(home), changes: [] } : await planDesiredPolicy(home, config);
  const validation = validateDesiredPolicy(plan.draft, plan.config);
  if (!validation.ok) {
    const summary = validation.issues.map((item) => item.message).join("; ");
    throw new Error(`Policy validation failed: ${summary}`);
  }

  const unresolved = await unresolvedChefVaultRefs(plan.config, plan.draft.pools);
  if (unresolved.length) {
    throw new Error(`Policy apply blocked: ${unresolved.map((item) => item.message).join("; ")}`);
  }

  await fs.mkdir(revisionsDir(home), { recursive: true, mode: 0o700 });
  const revision = plan.draft.revision;
  await atomicWrite(revisionPath(home, revision), `${JSON.stringify(plan.draft, null, 2)}\n`);

  const targetPath = plan.targetPath;
  await fs.mkdir(path.dirname(targetPath), { recursive: true, mode: 0o700 });
  const backupId = (await pathExists(targetPath))
    ? await createBackup([targetPath], home)
    : undefined;

  await atomicWrite(targetPath, `${JSON.stringify(plan.draft, null, 2)}\n`);
  await atomicWrite(activePointerPath(home), `${JSON.stringify({
    revision,
    appliedAt: new Date().toISOString(),
    targetPath,
  }, null, 2)}\n`);

  return { revision, targetPath, backupId };
}

export async function rollbackDesiredPolicy(home: string, revision?: string): Promise<{ revision: string; targetPath: string }> {
  const revisions = (await fs.readdir(revisionsDir(home)).catch(() => [])).map((name) => name.replace(/\.json$/, "")).sort().reverse();

  let target: string | undefined;
  if (revision) {
    // Explicit revision: restore exactly what was asked for.
    if (!revisions.includes(revision)) throw new Error(`Unknown provider-security revision ${revision}`);
    target = revision;
  } else {
    // No argument: step back to the revision preceding the active one.
    const pointerText = await readText(activePointerPath(home));
    const active = pointerText.trim()
      ? (JSON.parse(pointerText) as { revision?: string }).revision
      : undefined;
    const index = active ? revisions.indexOf(active) : -1;
    target = index >= 0 ? revisions[index + 1] : revisions[1] ?? revisions[0];
    if (!target) throw new Error(active ? `No previous revision before ${active}` : "No provider-security revision available to rollback");
  }

  const previous = target;
  const policy = JSON.parse(await readText(revisionPath(home, previous))) as DesiredPolicyDocument;
  const validation = validateDesiredPolicy(policy, await loadProviderSecurityConfig(home));
  if (!validation.ok) throw new Error("Previous revision fails validation; refusing rollback");

  const targetPath = opencodexPolicyPath(home);
  if (await pathExists(targetPath)) await createBackup([targetPath], home);
  await atomicWrite(targetPath, `${JSON.stringify(policy, null, 2)}\n`);
  await atomicWrite(activePointerPath(home), `${JSON.stringify({
    revision: previous,
    appliedAt: new Date().toISOString(),
    targetPath,
  }, null, 2)}\n`);

  return { revision: previous, targetPath };
}

export async function doctorProviderSecurity(home: string): Promise<PolicyDoctorResult> {
  const config = await loadProviderSecurityConfig(home);
  const issues: PolicyValidationIssue[] = [];
  try {
    forbidLocalFallback(config);
  } catch (error) {
    issues.push({ code: "fleet-backend-invalid", message: (error as Error).message });
  }

  const targetPath = opencodexPolicyPath(home);
  let activeRevision: string | undefined;
  const pointerText = await readText(activePointerPath(home));
  if (pointerText.trim()) {
    try {
      activeRevision = (JSON.parse(pointerText) as { revision?: string }).revision;
    } catch {
      issues.push({
        code: "active-pointer-corrupt",
        message: `Active revision pointer is not valid JSON at ${activePointerPath(home)}`,
      });
    }
  }

  let chefvaultReachable: boolean | undefined;
  let chefvaultAuthenticated: boolean | undefined;
  if (config.secretBackend === "chefvault") {
    const client = new ChefVaultProviderSecurityClient(config);
    const health = await client.health();
    chefvaultReachable = health.ok;
    if (!health.ok) {
      issues.push({
        code: "chefvault-unreachable",
        message: config.fleetMode
          ? "ChefVault provider-security endpoint unreachable; fleet mode forbids local fallback"
          : `ChefVault provider-security endpoint unreachable at ${health.url}`,
      });
    } else {
      const auth = await client.probeAuthentication();
      chefvaultAuthenticated = auth.ok;
      if (!auth.ok) {
        issues.push({
          code: auth.error?.includes("not set") ? "chefvault-token-missing" : "chefvault-unauthenticated",
          message: auth.error ?? "ChefVault Bearer authentication failed on /v1/refs/* probe",
        });
      }
    }
  }

  if (await pathExists(targetPath)) {
    try {
      const policy = JSON.parse(await readText(targetPath)) as DesiredPolicyDocument;
      issues.push(...validateDesiredPolicy(policy, config).issues);
    } catch {
      issues.push({ code: "policy-corrupt", message: `OpenCodex policy file is not valid JSON at ${targetPath}` });
    }
  } else {
    issues.push({ code: "policy-missing", message: `OpenCodex policy file missing at ${targetPath}` });
  }

  const backups = await listBackups(home);
  if (!backups.length) {
    issues.push({ code: "no-backups", message: "No CPM configuration backups found (non-fatal)" });
  }

  return {
    ok: issues.filter((item) => item.code !== "no-backups").length === 0,
    config,
    activeRevision,
    targetPath,
    chefvaultReachable,
    chefvaultAuthenticated,
    issues,
  };
}

export async function ensureProviderSecurityConfig(
  home: string,
  patch: Partial<Pick<ProviderSecurityConfig, "fleetMode" | "secretBackend" | "chefvaultUrl">>,
): Promise<ProviderSecurityConfig> {
  const current = await loadProviderSecurityConfig(home);
  const next: ProviderSecurityConfig = {
    ...current,
    fleetMode: patch.fleetMode ?? current.fleetMode,
    secretBackend: patch.secretBackend ?? current.secretBackend,
    chefvaultUrl: patch.chefvaultUrl ?? current.chefvaultUrl,
    updatedAt: current.updatedAt,
    schemaVersion: 1,
    targetRuntime: "opencodex",
  };
  if (next.fleetMode) next.secretBackend = "chefvault";
  return await saveProviderSecurityConfig(home, next);
}
