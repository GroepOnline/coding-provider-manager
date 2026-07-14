import { describe, expect, it } from "vitest";
import { getProvider, modelBaseUrl, modelProtocol, providerConfigId, providers } from "../src/providers/catalog.js";

describe("providers catalog helpers", () => {
  it("throws a stable error for unknown providers", () => {
    expect(() => getProvider("not-a-provider")).toThrow(/Unknown provider: not-a-provider/);
  });

  it("derives protocol-aware config ids and base URLs", () => {
    const zen = getProvider("opencode-zen");
    const responses = zen.models.find((item) => item.id === "gpt-5.6-terra");
    const anthropic = zen.models.find((item) => item.id === "claude-sonnet-5");
    const chat = zen.models.find((item) => item.id === "glm-5.2");
    expect(responses).toBeDefined();
    expect(anthropic).toBeDefined();
    expect(chat).toBeDefined();
    expect(modelProtocol(zen, responses!)).toBe("openai-responses");
    expect(modelProtocol(zen, anthropic!)).toBe("anthropic-messages");
    expect(modelBaseUrl(zen, responses!)).toBe(zen.responsesBaseUrl);
    expect(modelBaseUrl(zen, anthropic!)).toBe(zen.anthropicBaseUrl);
    expect(modelBaseUrl(zen, chat!)).toBe(zen.openAIBaseUrl);
    expect(providerConfigId(zen, "openai-responses")).toBe("cpm-opencode-zen-responses");
    expect(providerConfigId(zen, "anthropic-messages")).toBe("cpm-opencode-zen-messages");
  });

  it("keeps every catalog provider keyed and tool-scoped", () => {
    expect(providers.length).toBeGreaterThanOrEqual(9);
    for (const provider of providers) {
      expect(provider.keyEnv).toMatch(/^[A-Z0-9_]+$/);
      expect(provider.models.length).toBeGreaterThan(0);
      expect(provider.allowedTools?.length ?? 0).toBeGreaterThan(0);
      expect(provider.defaultTools?.length ?? 0).toBeGreaterThan(0);
    }
  });
});
