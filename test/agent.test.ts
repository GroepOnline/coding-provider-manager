import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addSecret, providerScope } from "../src/core/vault.js";
import { agentManifest, dispatchAgentRequest } from "../src/agent/index.js";

const homes: string[] = [];
afterEach(async () => Promise.all(homes.splice(0).map((home) => fs.rm(home, { recursive: true, force: true }))));

describe("agent protocol", () => {
  it("exposes a non-interactive manifest and secret-free key operations", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-agent-"));
    homes.push(home);
    await addSecret(home, providerScope("deepseek"), "primary", "super-secret", true);
    expect(agentManifest()).toMatchObject({ agentCompatible: true, interactiveRequired: false, secretsReturned: false });
    const response = await dispatchAgentRequest(home, { id: 7, method: "keys.list", params: { provider: "deepseek" } });
    expect(response.ok).toBe(true);
    expect(JSON.stringify(response)).not.toContain("super-secret");
  });

  it("returns stable machine errors", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-agent-"));
    homes.push(home);
    const response = await dispatchAgentRequest(home, { method: "missing.method" });
    expect(response).toMatchObject({ ok: false, error: { code: "METHOD_NOT_FOUND" } });
  });
});
