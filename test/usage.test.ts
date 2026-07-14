import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addSecret, listSecrets, providerScope } from "../src/core/vault.js";
import { fetchProviderUsage, selectBestProviderKey } from "../src/usage/index.js";

const homes: string[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(homes.splice(0).map((home) => fs.rm(home, { recursive: true, force: true })));
});

async function tempHome() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-usage-"));
  homes.push(home);
  return home;
}

describe("usage adapters", () => {
  it("reads OpenRouter key usage and selects the key with most remaining quota", async () => {
    const home = await tempHome();
    await addSecret(home, providerScope("openrouter"), "small", "key-small", true);
    await addSecret(home, providerScope("openrouter"), "large", "key-large", false);
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init?: RequestInit) => {
      const auth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
      const remaining = auth.includes("large") ? 90 : 10;
      return new Response(JSON.stringify({ data: { limit_remaining: remaining, usage: 5 } }), { status: 200 });
    }));
    const first = await fetchProviderUsage(home, "openrouter", "small");
    expect(first.score).toBe(10);
    const best = await selectBestProviderKey(home, "openrouter");
    expect(best.alias).toBe("large");
    expect((await listSecrets(home, providerScope("openrouter"))).find((item) => item.active)?.alias).toBe("large");
  });

  it("returns structured unavailable output for providers without a verified usage endpoint", async () => {
    const home = await tempHome();
    const result = await fetchProviderUsage(home, "minimax");
    expect(result.available).toBe(false);
    expect(result.summary).toContain("no verified public account usage endpoint");
  });
});
