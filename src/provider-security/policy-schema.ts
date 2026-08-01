import type {
  DesiredPolicyDocument,
  PolicyValidationIssue,
  PolicyValidationResult,
  ProviderPoolPolicy,
  ProviderSecurityConfig,
  SecretBackendId,
} from "./types.js";

const CHEFVAULT_REF = /^chefvault:\/\/[a-z0-9._-]+\/[a-z0-9._/-]+$/i;
const CPM_LOCAL_REF = /^cpm-local:\/\/[a-z0-9._/-]+(?::[a-z0-9._-]+)?$/i;

const RAW_SECRET_PATTERNS: Array<{ code: string; pattern: RegExp; label: string }> = [
  { code: "raw-openai-key", pattern: /\bsk[-_]?[A-Za-z0-9]{20,}\b/, label: "OpenAI-style API key" },
  { code: "raw-prefixed-key", pattern: /\b(gsk|pk|rk|api)[-_][A-Za-z0-9]{20,}\b/, label: "prefixed API key" },
  { code: "raw-aws-key", pattern: /\bAKIA[0-9A-Z]{16}\b/, label: "AWS access key id" },
  { code: "raw-jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, label: "JWT bearer token" },
  { code: "raw-bearer", pattern: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/i, label: "Bearer token" },
  { code: "raw-api-key-field", pattern: /"(api[_-]?key|secret|token|password)"\s*:\s*"[^"{][^"]{8,}"/i, label: "inline secret field" },
];

export function chefVaultRef(pool: string, slot: string): string {
  return `chefvault://${pool}/${slot}`;
}

export function cpmLocalRef(scope: string, alias = "default"): string {
  return alias === "default" ? `cpm-local://${scope}` : `cpm-local://${scope}:${alias}`;
}

export function expectedRefPattern(backend: SecretBackendId): RegExp {
  return backend === "chefvault" ? CHEFVAULT_REF : CPM_LOCAL_REF;
}

export function scanRawCredentials(text: string, prefix = ""): PolicyValidationIssue[] {
  const issues: PolicyValidationIssue[] = [];
  for (const rule of RAW_SECRET_PATTERNS) {
    if (rule.pattern.test(text)) {
      issues.push({
        code: rule.code,
        message: `Possible ${rule.label} detected in policy output`,
        path: prefix || undefined,
      });
    }
  }
  return issues;
}

export function validatePoolRef(
  pool: ProviderPoolPolicy,
  config: ProviderSecurityConfig,
  index: number,
): PolicyValidationIssue[] {
  const issues: PolicyValidationIssue[] = [];
  const path = `pools[${index}].credentialRef`;

  if (config.fleetMode) {
    if (!CHEFVAULT_REF.test(pool.credentialRef)) {
      issues.push({
        code: "fleet-opaque-ref-required",
        message: "Fleet policy output must use opaque chefvault:// refs only",
        path,
      });
    }
    if (CPM_LOCAL_REF.test(pool.credentialRef)) {
      issues.push({
        code: "fleet-local-ref-forbidden",
        message: "cpm-local:// refs are forbidden in fleet policy output",
        path,
      });
    }
  } else if (!expectedRefPattern(config.secretBackend).test(pool.credentialRef)) {
    issues.push({
      code: "invalid-credential-ref",
      message: `credentialRef must match ${config.secretBackend} ref pattern`,
      path,
    });
  }

  issues.push(...scanRawCredentials(pool.credentialRef, path));
  return issues;
}

export function validateDesiredPolicy(
  policy: DesiredPolicyDocument,
  config: ProviderSecurityConfig,
): PolicyValidationResult {
  const issues: PolicyValidationIssue[] = [];

  if (policy.secretBackend !== config.secretBackend) {
    issues.push({
      code: "fleet-backend-mismatch",
      message: `Policy secretBackend=${policy.secretBackend} does not match config secretBackend=${config.secretBackend}`,
      path: "secretBackend",
    });
  }

  if (policy.fleetMode !== config.fleetMode) {
    issues.push({
      code: "fleet-flag-mismatch",
      message: `Policy fleetMode=${policy.fleetMode} does not match config fleetMode=${config.fleetMode}`,
      path: "fleetMode",
    });
  }

  if (policy.targetRuntime !== "opencodex") {
    issues.push({
      code: "unsupported-runtime",
      message: "Only opencodex is supported as policy target runtime",
      path: "targetRuntime",
    });
  }

  for (const [index, pool] of policy.pools.entries()) {
    if (typeof pool.weight !== "number" || pool.weight <= 0) {
      issues.push({ code: "invalid-weight", message: "Pool weight must be a positive number", path: `pools[${index}].weight` });
    }
    issues.push(...validatePoolRef(pool, config, index));
  }

  issues.push(...scanRawCredentials(JSON.stringify(policy)));

  return {
    ok: issues.length === 0,
    fleetMode: config.fleetMode,
    secretBackend: config.secretBackend,
    issues,
  };
}

export function assertFleetBackend(config: ProviderSecurityConfig): void {
  if (config.fleetMode && config.secretBackend !== "chefvault") {
    throw new Error("fleetMode requires secretBackend=chefvault");
  }
}
