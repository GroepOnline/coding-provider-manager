import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { agentManifest, dispatchAgentRequest } from "../src/agent/index.js";
import { fingerprintSecret } from "../src/core/vault.js";
import { zaiCodingProfile } from "../src/providers/zai.js";

vi.mock("../src/providers/models.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/providers/models.js")>();
  return {
    ...actual,
    resolveProviderModels: vi.fn(async (_home: string, provider: typeof zaiCodingProfile) => provider.models),
    fetchProviderModels: vi.fn(async (_home: string, provider: typeof zaiCodingProfile) => ({
      provider: provider.id,
      fetchedAt: new Date().toISOString(),
      source: ["mock"],
      models: provider.models,
    })),
    probeProvider: vi.fn(async () => undefined),
  };
});

const homes: string[] = [];
afterEach(async () => Promise.all(homes.splice(0).map((home) => fs.rm(home, { recursive: true, force: true }))));

async function tempHome(): Promise<string> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-agent-expand-"));
  homes.push(home);
  return home;
}

describe("agent protocol expand", () => {
  it("lists new parity methods on the manifest", () => {
    const methods = agentManifest().methods as readonly string[];
    expect(methods).toEqual(expect.arrayContaining([
      "plan.preview",
      "apply.execute",
      "doctor.run",
      "keys.add",
      "sync.status",
    ]));
  });

  it("adds keys without returning or echoing the secret value", async () => {
    const home = await tempHome();
    const secret = "agent-protocol-secret-value-never-echo";
    const response = await dispatchAgentRequest(home, {
      id: 1,
      method: "keys.add",
      params: { provider: "deepseek", alias: "primary", value: secret },
    });
    expect(response).toMatchObject({
      ok: true,
      result: {
        provider: "deepseek",
        alias: "primary",
        active: true,
        fingerprint: fingerprintSecret(secret),
      },
    });
    expect(JSON.stringify(response)).not.toContain(secret);

    const listed = await dispatchAgentRequest(home, {
      method: "keys.list",
      params: { provider: "deepseek" },
    });
    expect(listed.ok).toBe(true);
    expect(JSON.stringify(listed)).not.toContain(secret);
  });

  it("rejects keys.add without value or fromEnv", async () => {
    const home = await tempHome();
    const response = await dispatchAgentRequest(home, {
      method: "keys.add",
      params: { provider: "deepseek" },
    });
    expect(response.ok).toBe(false);
    expect(response.error?.message).toMatch(/Missing string parameter: value/);
  });

  it("previews plans without file bodies", async () => {
    const home = await tempHome();
    const response = await dispatchAgentRequest(home, {
      id: 2,
      method: "plan.preview",
      params: { provider: "zai-coding", tools: "factory" },
    });
    expect(response.ok).toBe(true);
    const result = response.result as {
      providers: Array<{ provider: string; plans: Array<Record<string, unknown>> }>;
    };
    expect(result.providers[0]?.provider).toBe("zai-coding");
    expect(result.providers[0]?.plans.length).toBeGreaterThan(0);
    for (const plan of result.providers[0]!.plans) {
      expect(plan).toHaveProperty("tool");
      expect(plan).toHaveProperty("status");
      expect(plan).toHaveProperty("notes");
      expect(plan).not.toHaveProperty("after");
      expect(plan).not.toHaveProperty("before");
    }
  });

  it("applies ready plans and reports a backup id", async () => {
    const home = await tempHome();
    const response = await dispatchAgentRequest(home, {
      id: 3,
      method: "apply.execute",
      params: { provider: "zai-coding", tools: "factory" },
    });
    expect(response.ok).toBe(true);
    const result = response.result as {
      applied: Array<{ provider: string; backup?: string; plans: Array<{ status: string }> }>;
    };
    expect(result.applied[0]?.provider).toBe("zai-coding");
    expect(result.applied[0]?.plans.some((plan) => plan.status === "ready")).toBe(true);
    expect(typeof result.applied[0]?.backup === "string" || result.applied[0]?.backup === undefined).toBe(true);
    const settings = path.join(home, ".factory", "settings.json");
    await expect(fs.stat(settings)).resolves.toBeTruthy();
  });

  it("runs doctor with mocked network probes and never returns secrets", async () => {
    const home = await tempHome();
    const secret = "doctor-probe-secret-value";
    await dispatchAgentRequest(home, {
      method: "keys.add",
      params: { provider: "zai-coding", alias: "probe", value: secret },
    });
    const { probeProvider, fetchProviderModels } = await import("../src/providers/models.js");
    const response = await dispatchAgentRequest(home, {
      id: 4,
      method: "doctor.run",
      params: { provider: "zai-coding", alias: "probe", probe: true },
    });
    expect(response.ok).toBe(true);
    expect(JSON.stringify(response)).not.toContain(secret);
    expect(vi.mocked(fetchProviderModels)).toHaveBeenCalled();
    expect(vi.mocked(probeProvider).mock.calls.length).toBeGreaterThanOrEqual(2);
    const result = response.result as { results: Array<{ provider: string; probes: string[]; ok: boolean }> };
    expect(result.results[0]).toMatchObject({
      provider: "zai-coding",
      ok: true,
    });
    expect(result.results[0]!.probes).toEqual(expect.arrayContaining(["auth", "streaming"]));
  });

  it("reports local sync status without SSH or secrets", async () => {
    const home = await tempHome();
    const response = await dispatchAgentRequest(home, { id: 5, method: "sync.status" });
    expect(response.ok).toBe(true);
    expect(response.result).toMatchObject({
      schemaVersion: 1,
      home,
      secretsIncluded: false,
      pullRequiresHost: true,
      resources: { total: 0, enabled: 0 },
    });
    expect(JSON.stringify(response)).not.toMatch(/sk-|api[_-]?key/i);
  });
});
