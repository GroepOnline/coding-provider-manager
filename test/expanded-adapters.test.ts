import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { codexAdapter, codexAppAdapter, codexIdeAdapter } from "../src/adapters/codex.js";
import { qwenCodeAdapter } from "../src/adapters/qwen.js";
import { opencodeAdapter } from "../src/adapters/opencode.js";
import { getProvider } from "../src/providers/catalog.js";

const home = "/tmp/cpm-expanded-adapters";

describe("expanded coding surfaces", () => {
  it("Codex CLI/app/IDE share one OpenAI config without copying OAuth tokens", async () => {
    await fs.rm(home, { recursive: true, force: true });
    const provider = getProvider("openai");
    const ctx = { home, provider, models: provider.models, selectedModel: "gpt-5.6", makeDefault: true };
    const plans = await Promise.all([codexAdapter.plan(ctx), codexAppAdapter.plan(ctx), codexIdeAdapter.plan(ctx)]);
    expect(new Set(plans.map((item) => item.path)).size).toBe(1);
    for (const plan of plans) {
      expect(plan.status).toBe("ready");
      expect(plan.after).toContain('model_provider = "openai"');
      expect(plan.after).toContain('model = "gpt-5.6"');
      expect(plan.after).not.toContain("OPENAI_API_KEY");
      expect(plan.after).not.toContain("refresh_token");
    }
  });

  it("OpenCode uses its built-in OpenAI provider so OAuth remains usable", async () => {
    const provider = getProvider("openai");
    const ctx = { home, provider, models: provider.models, selectedModel: "gpt-5.6", makeDefault: true };
    const plan = await opencodeAdapter.plan(ctx);
    expect(plan.status).toBe("ready");
    expect(plan.after).toContain('"model": "openai/gpt-5.6"');
    expect(plan.after).not.toContain("cpm-openai");
    expect(plan.after).not.toContain("OPENAI_API_KEY");
  });

  it("Codex emits a custom Responses provider for OpenCode Zen", async () => {
    const provider = getProvider("opencode-zen");
    const ctx = { home, provider, models: provider.models, selectedModel: "gpt-5.6-terra", makeDefault: true };
    const plan = await codexAdapter.plan(ctx);
    expect(plan.status).toBe("ready");
    expect(plan.after).toContain('wire_api = "responses"');
    expect(plan.after).toContain('env_key = "OPENCODE_ZEN_API_KEY"');
    expect(plan.after).not.toContain("sk-");
  });

  it("Qwen Code gets protocol-aware provider entries with envKey only", async () => {
    await fs.rm(home, { recursive: true, force: true });
    const provider = getProvider("minimax");
    const ctx = { home, provider, models: provider.models, selectedModel: "MiniMax-M3", makeDefault: true };
    const plan = await qwenCodeAdapter.plan(ctx);
    expect(plan.status).toBe("ready");
    expect(plan.after).toContain('"modelProviders"');
    expect(plan.after).toContain('"openai"');
    expect(plan.after).toContain('"envKey": "MINIMAX_API_KEY"');
    expect(plan.after).toContain('"baseUrl": "https://api.minimax.io/v1"');
    expect(plan.after).not.toContain("sk-");
  });
});
