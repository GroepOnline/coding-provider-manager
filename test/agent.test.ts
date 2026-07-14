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

  it("lists providers and rotates keys without returning secrets", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-agent-"));
    homes.push(home);
    await addSecret(home, providerScope("deepseek"), "primary", "rotate-secret-one", true);
    await addSecret(home, providerScope("deepseek"), "secondary", "rotate-secret-two", false);

    const listed = await dispatchAgentRequest(home, { id: 1, method: "providers.list" });
    expect(listed.ok).toBe(true);
    expect(JSON.stringify(listed)).not.toMatch(/rotate-secret/);

    const next = await dispatchAgentRequest(home, { id: 2, method: "keys.next", params: { provider: "deepseek" } });
    expect(next).toMatchObject({ ok: true, result: { provider: "deepseek", activeKey: "secondary" } });

    const use = await dispatchAgentRequest(home, {
      id: 3,
      method: "keys.use",
      params: { provider: "deepseek", alias: "primary" },
    });
    expect(use).toMatchObject({ ok: true, result: { provider: "deepseek", activeKey: "primary" } });

    const missing = await dispatchAgentRequest(home, { method: "keys.use", params: { provider: "deepseek" } });
    expect(missing.ok).toBe(false);
    expect(missing.error?.message).toMatch(/Missing string parameter: alias/);
  });

  it("lists models for a provider without network calls", async () => {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-agent-"));
    homes.push(home);
    const response = await dispatchAgentRequest(home, {
      id: 9,
      method: "models.list",
      params: { provider: "deepseek" },
    });
    expect(response.ok).toBe(true);
    const models = response.result as Array<{ id: string }>;
    expect(models.some((item) => item.id === "deepseek-v4-flash")).toBe(true);
  });
});
