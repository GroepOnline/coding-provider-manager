import type { ProviderId } from "../types.js";

export type SecretBackendId = "chefvault" | "cpm-local";
export type PolicyTargetRuntime = "opencodex";

export interface ProviderSecurityConfig {
  schemaVersion: 1;
  fleetMode: boolean;
  secretBackend: SecretBackendId;
  targetRuntime: PolicyTargetRuntime;
  chefvaultUrl?: string;
  updatedAt: string;
}

export interface ProviderPoolLimits {
  weight: number;
  rpm?: number;
  concurrency?: number;
  budgetUsd?: number;
  fallbackCap?: number;
}

export interface ProviderPoolPolicy extends ProviderPoolLimits {
  providerId: ProviderId;
  /** Opaque credential reference — chefvault:// in fleet mode, cpm-local:// in standalone. */
  credentialRef: string;
  enabled?: boolean;
}

export interface DesiredPolicyDocument {
  schemaVersion: 1;
  revision: string;
  fleetMode: boolean;
  secretBackend: SecretBackendId;
  targetRuntime: PolicyTargetRuntime;
  pools: ProviderPoolPolicy[];
  issuedAt: string;
}

export interface PolicyActivePointer {
  revision: string;
  appliedAt: string;
  targetPath: string;
}

export interface PolicyValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface PolicyValidationResult {
  ok: boolean;
  fleetMode: boolean;
  secretBackend: SecretBackendId;
  issues: PolicyValidationIssue[];
}

export interface PolicyPlanResult {
  config: ProviderSecurityConfig;
  draft: DesiredPolicyDocument;
  targetPath: string;
  changes: string[];
  /** chefvault:// refs the service could not resolve; apply is refused while non-empty. */
  unresolvedRefs?: PolicyValidationIssue[];
  warnings?: string[];
}

export interface PolicyApplyResult {
  revision: string;
  targetPath: string;
  backupId?: string;
}

export interface PolicyDoctorResult {
  ok: boolean;
  config: ProviderSecurityConfig;
  activeRevision?: string;
  targetPath: string;
  chefvaultReachable?: boolean;
  issues: PolicyValidationIssue[];
}
