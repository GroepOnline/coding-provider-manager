import os from "node:os";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  defaultProviderSecurityConfig,
  loadProviderSecurityConfig,
  providerSecurityRoot,
  saveProviderSecurityConfig,
} from "../src/provider-security/config.js";
import {
  applyDesiredPolicy,
  doctorProviderSecurity,
  opencodexPolicyPath,
  planDesiredPolicy,
  rollbackDesiredPolicy,
  validateDesiredPolicyFile,
} from "../src/provider-security/policy-ops.js";
import {
  chefVaultRef,
  cpmLocalRef,
  scanRawCredentials,
  validateDesiredPolicy,
} from "../src/provider-security/policy-schema.js";
import {
  forbidLocalFallback,
  resolveManagedSecret,
} from "../src/provider-security/secret-backend.js";
import { addSecret, providerScope } from "../src/core/vault.js";
import { saveState } from "../src/core/state.js";
import type { DesiredPolicyDocument } from "../src/provider-security/types.js";

const homes: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  delete process.env.CHEF_PROVIDER_SECURITY_TOKEN;
  await Promise.all(homes.splice(0).map((home) => fs.rm(home, { recursive: true, force: true })));
});

/** Pretend every chefvault:// ref resolves, so ref probing does not require a live service. */
function stubChefVaultRefs(resolvable = true): void {
  process.env.CHEF_PROVIDER_SECURITY_TOKEN = process.env.CHEF_PROVIDER_SECURITY_TOKEN ?? "test-token";
  vi.stubGlobal("fetch", async () => new Response(
    JSON.stringify({ fingerprint: "sha256:test" }),
    { status: resolvable ? 200 : 404, headers: { "content-type": "application/json" } },
  ));
}

async function tempHome(): Promise<string> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-psp-"));
  homes.push(home);
  return home;
}

describe("provider security plane", () => {
  it("requires chefvault backend when fleetMode is enabled", async () => {
    const home = await tempHome();
    await expect(saveProviderSecurityConfig(home, {
      ...defaultProviderSecurityConfig(),
      fleetMode: true,
      secretBackend: "cpm-local",
    })).rejects.toThrow(/fleetMode requires secretBackend=chefvault/);
  });

  it("forbids local vault fallback in fleet mode", async () => {
    const home = await tempHome();
    const config = {
      ...defaultProviderSecurityConfig(),
      fleetMode: true,
      secretBackend: "chefvault" as const,
    };
    await saveProviderSecurityConfig(home, config);
    await addSecret(home, providerScope("openrouter"), "primary", "skfix3", true);

    expect(() => forbidLocalFallback({
      ...config,
      secretBackend: "cpm-local",
    })).toThrow(/forbids local encrypted vault fallback/);

    // Deterministically simulate an unreachable ChefVault so the assertion exercises the guard, not the network.
    stubChefVaultRefs(false);
    await expect(resolveManagedSecret(home, config, providerScope("openrouter"), "primary", "OPENROUTER_API_KEY"))
      .rejects.toThrow(/local vault fallback is forbidden/);
  });

  it("rejects raw credentials in fleet policy validation", async () => {
    const home = await tempHome();
    const config = {
      ...defaultProviderSecurityConfig(),
      fleetMode: true,
      secretBackend: "chefvault" as const,
    };
    await saveProviderSecurityConfig(home, config);

    const badPolicy: DesiredPolicyDocument = {
      schemaVersion: 1,
      revision: "test-rev",
      fleetMode: true,
      secretBackend: "chefvault",
      targetRuntime: "opencodex",
      issuedAt: new Date().toISOString(),
      pools: [{
        providerId: "openrouter",
        weight: 100,
        credentialRef: "skABCDEFGHIJKLMNOPQRST",
      }],
    };

    const result = validateDesiredPolicy(badPolicy, config);
    expect(result.ok).toBe(false);
    expect(result.issues.some((item) => item.code === "fleet-opaque-ref-required")).toBe(true);
    expect(result.issues.some((item) => item.code.startsWith("raw-"))).toBe(true);

    const validation = await validateDesiredPolicyFile(home, badPolicy, config);
    expect(validation.ok).toBe(false);
  });

  it("accepts opaque chefvault refs and writes revisioned policy without secrets", async () => {
    stubChefVaultRefs();
    const home = await tempHome();
    const config = {
      ...defaultProviderSecurityConfig(),
      fleetMode: true,
      secretBackend: "chefvault" as const,
    };
    await saveProviderSecurityConfig(home, config);
    await saveState(home, {
      schemaVersion: 2,
      providers: {
        "zai-coding": { enabled: true, activeKey: "primary", selectedModels: ["glm-4.7"], selectedTools: ["opencode"] },
      },
      selectedProviders: ["zai-coding"],
      updatedAt: new Date().toISOString(),
    });
    await addSecret(home, providerScope("zai-coding"), "primary", "skfix1", true);

    const plan = await planDesiredPolicy(home, config);
    expect(plan.draft.pools[0]?.credentialRef).toMatch(/^chefvault:\/\//);
    expect(JSON.stringify(plan.draft)).not.toContain("skfix1");

    const validation = await validateDesiredPolicy(plan.draft, config);
    expect(validation.ok).toBe(true);

    const applied = await applyDesiredPolicy(home, plan.draft, { yes: true });
    const written = await fs.readFile(opencodexPolicyPath(home), "utf8");
    expect(written).not.toContain("skfix1");
    expect(written).toContain(chefVaultRef("pools/zai-coding", "primary"));
    expect(applied.revision).toBe(plan.draft.revision);
  });

  it("refuses to write anything without confirmation or with an unresolvable chefvault ref", async () => {
    stubChefVaultRefs();
    const home = await tempHome();
    const config = {
      ...defaultProviderSecurityConfig(),
      fleetMode: true,
      secretBackend: "chefvault" as const,
    };
    await saveProviderSecurityConfig(home, config);
    await saveState(home, {
      schemaVersion: 2,
      providers: {
        "zai-coding": { enabled: true, activeKey: "primary", selectedModels: [], selectedTools: [] },
      },
      selectedProviders: ["zai-coding"],
      updatedAt: new Date().toISOString(),
    });
    const plan = await planDesiredPolicy(home, config);
    expect(plan.warnings).toEqual([]);

    await expect(applyDesiredPolicy(home, plan.draft)).rejects.toThrow(/without confirmation/);
    expect(existsSync(opencodexPolicyPath(home))).toBe(false);

    stubChefVaultRefs(false);
    await expect(applyDesiredPolicy(home, plan.draft, { yes: true })).rejects.toThrow(/cannot resolve/);
    expect(existsSync(opencodexPolicyPath(home))).toBe(false);
  });

  it("rolls back to the explicitly requested revision", async () => {
    const home = await tempHome();
    const config = await loadProviderSecurityConfig(home);
    const revisionsDir = path.join(providerSecurityRoot(home), "revisions");
    await fs.mkdir(revisionsDir, { recursive: true });

    const document = (revision: string): DesiredPolicyDocument => ({
      schemaVersion: 1,
      revision,
      fleetMode: false,
      secretBackend: "cpm-local",
      targetRuntime: "opencodex",
      issuedAt: new Date().toISOString(),
      pools: [{ providerId: "deepseek", weight: 100, credentialRef: cpmLocalRef(providerScope("deepseek")) }],
    });
    for (const revision of ["rev-100", "rev-200", "rev-300"]) {
      await fs.writeFile(path.join(revisionsDir, `${revision}.json`), `${JSON.stringify(document(revision), null, 2)}\n`);
    }
    await fs.writeFile(
      path.join(providerSecurityRoot(home), "active.json"),
      `${JSON.stringify({ revision: "rev-300", appliedAt: new Date().toISOString(), targetPath: opencodexPolicyPath(home) }, null, 2)}\n`,
    );

    const explicit = await rollbackDesiredPolicy(home, "rev-200");
    expect(explicit.revision).toBe("rev-200");
    expect(JSON.parse(await fs.readFile(opencodexPolicyPath(home), "utf8")).revision).toBe("rev-200");

    await fs.writeFile(
      path.join(providerSecurityRoot(home), "active.json"),
      `${JSON.stringify({ revision: "rev-300", appliedAt: new Date().toISOString(), targetPath: opencodexPolicyPath(home) }, null, 2)}\n`,
    );
    const implicit = await rollbackDesiredPolicy(home);
    expect(implicit.revision).toBe("rev-200");
    expect(config.secretBackend).toBe("cpm-local");
  });

  it("keeps standalone cpm-local backend functional", async () => {
    const home = await tempHome();
    const config = await loadProviderSecurityConfig(home);
    expect(config.secretBackend).toBe("cpm-local");
    expect(config.fleetMode).toBe(false);

    const scope = providerScope("deepseek");
    await addSecret(home, scope, "default", "skfix2", true);
    const resolved = await resolveManagedSecret(home, config, scope, "default", "DEEPSEEK_API_KEY");
    expect(resolved.value).toBe("skfix2");
    expect(resolved.source).toBe("vault");
  });

  it("scanRawCredentials detects inline apiKey fields", () => {
    const issues = scanRawCredentials('{"apiKey":"supersec1"}');
    expect(issues.some((item) => item.code === "raw-api-key-field")).toBe(true);
  });

  it("doctor distinguishes healthz reachability from Bearer authentication", async () => {
    const home = await tempHome();
    const config = {
      ...defaultProviderSecurityConfig(),
      fleetMode: true,
      secretBackend: "chefvault" as const,
    };
    await saveProviderSecurityConfig(home, config);

    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/healthz")) return new Response("ok", { status: 200 });
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
    });

    delete process.env.CHEF_PROVIDER_SECURITY_TOKEN;
    const missingToken = await doctorProviderSecurity(home);
    expect(missingToken.chefvaultReachable).toBe(true);
    expect(missingToken.chefvaultAuthenticated).toBe(false);
    expect(missingToken.issues.some((item) => item.code === "chefvault-token-missing")).toBe(true);

    process.env.CHEF_PROVIDER_SECURITY_TOKEN = "test-token";
    const badToken = await doctorProviderSecurity(home);
    expect(badToken.chefvaultReachable).toBe(true);
    expect(badToken.chefvaultAuthenticated).toBe(false);
    expect(badToken.issues.some((item) => item.code === "chefvault-unauthenticated")).toBe(true);

    vi.stubGlobal("fetch", async (url: string) => {
      if (url.endsWith("/healthz")) return new Response("ok", { status: 200 });
      return new Response(JSON.stringify({ fingerprint: "sha256:test" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const ok = await doctorProviderSecurity(home);
    expect(ok.chefvaultReachable).toBe(true);
    expect(ok.chefvaultAuthenticated).toBe(true);
  });
});
