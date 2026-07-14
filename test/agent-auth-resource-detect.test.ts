import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// Avoid real `where.exe` / `which` during auth.status — Windows CI can spend
// several seconds per flow and trip the default 5s test timeout.
vi.mock("../src/core/detect.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/core/detect.js")>();
  return {
    ...actual,
    commandExists: () => false,
  };
});

import { agentManifest, dispatchAgentRequest } from "../src/agent/index.js";
import { addSecret, fingerprintSecret, providerScope } from "../src/core/vault.js";
import { upsertResource } from "../src/resources/registry.js";

const homes: string[] = [];
afterEach(async () => Promise.all(homes.splice(0).map((home) => fs.rm(home, { recursive: true, force: true }))));

async function tempHome(): Promise<string> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-agent-ard-"));
  homes.push(home);
  return home;
}

describe("agent auth/resource/detect methods", { timeout: 15_000 }, () => {
  it("lists auth.status, resource.list and detect.run on the manifest", () => {
    const methods = agentManifest().methods as readonly string[];
    expect(methods).toEqual(expect.arrayContaining([
      "auth.status",
      "resource.list",
      "resources.list",
      "accounts.list",
      "detect.run",
      "apps.list",
    ]));
  });

  it("returns auth.status without secrets or interactive login", async () => {
    const home = await tempHome();
    const secret = "auth-status-secret-value-never-echo";
    await addSecret(home, providerScope("deepseek"), "primary", secret, true);

    const response = await dispatchAgentRequest(home, {
      id: 1,
      method: "auth.status",
    });
    expect(response.ok).toBe(true);
    expect(JSON.stringify(response)).not.toContain(secret);

    const result = response.result as {
      interactiveRequired: boolean;
      secretsReturned: boolean;
      flows: Array<{ id: string; commandInstalled: boolean; statusSupported: boolean }>;
      providers: Array<{ id: string; activeKey?: string; fingerprints: Array<{ fingerprint: string }> }>;
      accountDrivers: Array<{ id: string }>;
    };
    expect(result.interactiveRequired).toBe(false);
    expect(result.secretsReturned).toBe(false);
    expect(result.flows.some((flow) => flow.id === "github-cli")).toBe(true);
    expect(result.accountDrivers.some((driver) => driver.id === "github")).toBe(true);

    const deepseek = result.providers.find((item) => item.id === "deepseek");
    expect(deepseek?.activeKey).toBe("primary");
    expect(deepseek?.fingerprints[0]?.fingerprint).toBe(fingerprintSecret(secret));
  });

  it("filters auth.status by flow id", async () => {
    const home = await tempHome();
    const response = await dispatchAgentRequest(home, {
      method: "auth.status",
      params: { flow: "github-cli" },
    });
    expect(response.ok).toBe(true);
    const result = response.result as { flows: Array<{ id: string; command: string; statusSupported: boolean }> };
    expect(result.flows).toHaveLength(1);
    expect(result.flows[0]).toMatchObject({
      id: "github-cli",
      command: "gh",
      statusSupported: true,
    });
  });

  it("lists resources via resource.list without resolving secret values", async () => {
    const home = await tempHome();
    const secret = "resource-list-secret-should-stay-in-vault";
    await addSecret(home, "mcp/demo", "default", secret, true);
    await upsertResource(home, {
      id: "demo",
      kind: "mcp",
      enabled: true,
      targets: ["opencode"],
      config: { type: "local", command: "npx", args: ["-y", "demo"], apiKey: secret },
      secretRefs: { DEMO_TOKEN: { scope: "mcp/demo", keyAlias: "default" } },
    });

    const response = await dispatchAgentRequest(home, {
      id: 2,
      method: "resource.list",
      params: { kind: "mcp" },
    });
    expect(response.ok).toBe(true);
    expect(JSON.stringify(response)).not.toContain(secret);

    const result = response.result as {
      total: number;
      enabled: number;
      resources: Array<{
        id: string;
        kind: string;
        config: Record<string, unknown>;
        secretRefs?: Record<string, { scope: string; keyAlias?: string; valueIncluded: boolean }>;
      }>;
    };
    expect(result).toMatchObject({ total: 1, enabled: 1 });
    expect(result.resources[0]).toMatchObject({
      id: "demo",
      kind: "mcp",
      config: { type: "local", command: "npx", args: ["-y", "demo"], apiKey: "[redacted]" },
      secretRefs: { DEMO_TOKEN: { scope: "mcp/demo", keyAlias: "default", valueIncluded: false } },
    });

    const legacy = await dispatchAgentRequest(home, { method: "resources.list", params: { kind: "mcp" } });
    expect(legacy.ok).toBe(true);
    expect(Array.isArray(legacy.result)).toBe(true);
    expect(JSON.stringify(legacy)).not.toContain(secret);
  });

  it("runs detect.run equivalent to apps.list detection", async () => {
    const home = await tempHome();
    const detected = await dispatchAgentRequest(home, { id: 3, method: "detect.run" });
    expect(detected.ok).toBe(true);

    const result = detected.result as {
      total: number;
      installed: number;
      tools: Array<{ id: string; installed: boolean; displayName: string }>;
    };
    expect(result.total).toBeGreaterThan(0);
    expect(result.tools.length).toBe(result.total);
    expect(result.installed).toBe(result.tools.filter((item) => item.installed).length);
    expect(result.tools.every((item) => typeof item.id === "string" && typeof item.displayName === "string")).toBe(true);
    expect(agentManifest().methods).toEqual(expect.arrayContaining(["detect.run", "apps.list"]));
  }, 20_000);
});
