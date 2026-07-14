import { describe, expect, it } from "vitest";
import { getProvider, modelProtocol } from "../src/providers/catalog.js";
import { opencodeAdapter } from "../src/adapters/opencode.js";
import { codexAdapter } from "../src/adapters/codex.js";

const home = "/tmp/cpm-provider-test";

describe("multi-provider protocol routing", () => {
  it("models OpenCode Zen as separate chat, responses and anthropic routes", async () => {
    const provider = getProvider("opencode-zen");
    expect(new Set(provider.models.map((item) => modelProtocol(provider, item)))).toEqual(new Set(["openai-chat", "openai-responses", "anthropic-messages"]));
    const plan = await opencodeAdapter.plan({ home, provider, models: provider.models, selectedModel: "gpt-5.6-terra", makeDefault: true });
    expect(plan.after).toContain("cpm-opencode-zen-chat");
    expect(plan.after).toContain("cpm-opencode-zen-responses");
    expect(plan.after).toContain("cpm-opencode-zen-messages");
    expect(plan.after).toContain("@ai-sdk/openai");
    expect(plan.after).toContain("@ai-sdk/anthropic");
    expect(plan.after).toContain("{env:OPENCODE_ZEN_API_KEY}");
  });

  it("only emits a Codex provider for Responses models", async () => {
    const zen = getProvider("opencode-zen");
    const plan = await codexAdapter.plan({ home, provider: zen, models: zen.models, selectedModel: "gpt-5.6-terra" });
    expect(plan.status).toBe("ready");
    expect(plan.after).toContain('wire_api = "responses"');
    expect(plan.after).toContain('env_key = "OPENCODE_ZEN_API_KEY"');

    const go = getProvider("opencode-go");
    const blocked = await codexAdapter.plan({ home, provider: go, models: go.models, selectedModel: "glm-5.2" });
    expect(blocked.status).toBe("unsupported");
  });

  it("treats ClinePass as a normal external API-key provider", () => {
    const provider = getProvider("cline-pass");
    expect(provider.keyEnv).toBe("CLINE_API_KEY");
    expect(provider.openAIBaseUrl).toBe("https://api.cline.bot/api/v1");
    expect(provider.models.some((item) => item.id === "cline-pass/qwen3.7-max")).toBe(true);
  });
});
