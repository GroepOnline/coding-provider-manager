import type { ProviderSecurityConfig } from "./types.js";
import {
  resolveChefVaultIdentityHeaders,
  resolveChefVaultSecurityToken,
  resolveChefVaultSecurityUrl,
} from "./config.js";

export interface ChefVaultRefStatus {
  ref: string;
  ok: boolean;
  fingerprint?: string;
  error?: string;
}

export interface ChefVaultHealth {
  ok: boolean;
  url: string;
  status?: number;
  error?: string;
}

export interface ChefVaultAuthProbe {
  ok: boolean;
  error?: string;
}

function normalizeRef(ref: string): string {
  return ref.startsWith("chefvault://") ? ref : `chefvault://${ref.replace(/^\/+/, "")}`;
}

function authErrorMessage(status: number, context: "ref probe" | "auth probe"): string {
  if (status === 401) {
    return `ChefVault ${context} unauthorized (401): missing or invalid Bearer token`;
  }
  if (status === 403) {
    return `ChefVault ${context} forbidden (403): Bearer token rejected or identity headers mismatch`;
  }
  return `ChefVault ${context} failed (${status})`;
}

export class ChefVaultProviderSecurityClient {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly token?: string;

  constructor(config: ProviderSecurityConfig, timeoutMs = 5_000) {
    this.baseUrl = resolveChefVaultSecurityUrl(config).replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
    this.token = resolveChefVaultSecurityToken(config);
  }

  protectedHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/json",
      ...resolveChefVaultIdentityHeaders(),
    };
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    return headers;
  }

  async health(): Promise<ChefVaultHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`, { method: "GET", signal: AbortSignal.timeout(this.timeoutMs) });
      return { ok: response.ok, url: this.baseUrl, status: response.status };
    } catch (error) {
      return { ok: false, url: this.baseUrl, error: (error as Error).message };
    }
  }

  /** Probe Bearer auth against a protected route without requiring a real ref to exist. */
  async probeAuthentication(): Promise<ChefVaultAuthProbe> {
    if (!this.token) {
      return { ok: false, error: "CHEF_PROVIDER_SECURITY_TOKEN is not set (required for /v1/refs/*)" };
    }
    const status = await this.inspectRef("chefvault://_probe/auth");
    // 200 means the probe ref resolved; 404 means ChefVault accepted the token
    // and only the ref is missing. Anything else (transport error, 5xx, 401/403)
    // is not proof that authentication succeeded.
    if (status.ok || status.error?.includes("(404)")) return { ok: true };
    return { ok: false, error: status.error ?? "ChefVault authentication probe failed" };
  }

  /** Resolve ref metadata without returning secret material. */
  async inspectRef(ref: string): Promise<ChefVaultRefStatus> {
    const normalized = normalizeRef(ref);
    if (!this.token) {
      return {
        ref: normalized,
        ok: false,
        error: "ChefVault ref probe requires CHEF_PROVIDER_SECURITY_TOKEN (Bearer auth)",
      };
    }
    try {
      const encoded = encodeURIComponent(normalized);
      const response = await fetch(`${this.baseUrl}/v1/refs/${encoded}`, {
        method: "GET",
        headers: this.protectedHeaders(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (response.status === 401 || response.status === 403) {
        return {
          ref: normalized,
          ok: false,
          error: authErrorMessage(response.status, "ref probe"),
        };
      }
      if (!response.ok) {
        return { ref: normalized, ok: false, error: `ChefVault ref probe failed (${response.status})` };
      }
      const body = await response.json() as { fingerprint?: string };
      return { ref: normalized, ok: true, fingerprint: body.fingerprint };
    } catch (error) {
      return { ref: normalized, ok: false, error: (error as Error).message };
    }
  }
}
