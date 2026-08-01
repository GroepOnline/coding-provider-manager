import type { ProviderSecurityConfig } from "./types.js";
import { resolveChefVaultSecurityUrl } from "./config.js";

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

function normalizeRef(ref: string): string {
  return ref.startsWith("chefvault://") ? ref : `chefvault://${ref.replace(/^\/+/, "")}`;
}

export class ChefVaultProviderSecurityClient {
  readonly baseUrl: string;
  readonly timeoutMs: number;

  constructor(config: ProviderSecurityConfig, timeoutMs = 5_000) {
    this.baseUrl = resolveChefVaultSecurityUrl(config).replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  async health(): Promise<ChefVaultHealth> {
    try {
      const response = await fetch(`${this.baseUrl}/healthz`, { method: "GET", signal: AbortSignal.timeout(this.timeoutMs) });
      return { ok: response.ok, url: this.baseUrl, status: response.status };
    } catch (error) {
      return { ok: false, url: this.baseUrl, error: (error as Error).message };
    }
  }

  /** Resolve ref metadata without returning secret material. */
  async inspectRef(ref: string): Promise<ChefVaultRefStatus> {
    const normalized = normalizeRef(ref);
    try {
      const encoded = encodeURIComponent(normalized);
      const response = await fetch(`${this.baseUrl}/v1/refs/${encoded}`, { method: "GET", signal: AbortSignal.timeout(this.timeoutMs) });
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
