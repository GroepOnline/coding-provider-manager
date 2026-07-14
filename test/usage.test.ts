import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addSecret, listSecrets, providerScope } from "../src/core/vault.js";
import {
  fetchProviderUsage,
  nativeUsageSupportMatrix,
  NATIVE_USAGE_PROVIDER_IDS,
  selectBestProviderKey,
} from "../src/usage/index.js";

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

  it("reads MiniMax coding plan remains and scores by lowest remaining window", async () => {
    const home = await tempHome();
    await addSecret(home, providerScope("minimax"), "a", "key-a", true);
    await addSecret(home, providerScope("minimax"), "b", "key-b", false);
    vi.stubGlobal("fetch", vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain("/v1/api/openplatform/coding_plan/remains");
      const auth = String((init?.headers as Record<string, string>)?.Authorization ?? "");
      const remaining = auth.includes("key-b") ? 80 : 20;
      return new Response(JSON.stringify({
        base_resp: { status_code: 0, status_msg: "success" },
        model_remains: [{
          model_name: "general",
          current_interval_remaining_percent: remaining,
          current_weekly_remaining_percent: remaining + 5,
          end_time: 1_800_000_000_000,
        }],
      }), { status: 200 });
    }));
    const first = await fetchProviderUsage(home, "minimax", "a");
    expect(first.available).toBe(true);
    expect(first.score).toBe(20);
    expect(first.summary).toContain("20%");
    const best = await selectBestProviderKey(home, "minimax");
    expect(best.alias).toBe("b");
    expect(best.score).toBe(80);
  });

  it("returns structured unavailable output for providers without a verified usage endpoint", async () => {
    const home = await tempHome();
    const result = await fetchProviderUsage(home, "openai");
    expect(result.available).toBe(false);
    expect(result.error).toBe("native-usage-unsupported");
    expect(result.summary).toContain("no verified public account usage endpoint");
    expect(result.summary).toContain("minimax");
  });

  it("exposes a doctor/usage support matrix with endpoints and next steps", () => {
    const matrix = nativeUsageSupportMatrix();
    expect(matrix.supported).toEqual([...NATIVE_USAGE_PROVIDER_IDS]);
    expect(matrix.supported).toContain("minimax");
    expect(matrix.supported).toContain("openrouter");
    expect(matrix.endpoints.minimax).toContain("coding_plan/remains");
    expect(matrix.endpoints.openrouter).toContain("openrouter.ai");
    expect(matrix.nextSteps.length).toBeGreaterThanOrEqual(3);
    expect(matrix.nextSteps.some((step) => step.includes("key best"))).toBe(true);
    expect(matrix.nextSteps.some((step) => step.includes("Admin API key"))).toBe(true);
  });
});
