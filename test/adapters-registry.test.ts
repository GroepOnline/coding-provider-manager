import { describe, expect, it } from "vitest";
import { adapterMap, adapters } from "../src/adapters/index.js";

describe("adapters registry", () => {
  it("registers unique tool ids with stable defaults", () => {
    const ids = adapters.map((adapter) => adapter.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(adapterMap.size).toBe(adapters.length);
    expect(adapterMap.get("opencode")?.surfaces).toEqual(expect.arrayContaining(["cli", "desktop", "ide"]));
    expect(adapterMap.get("factory")?.providerInjection).toBe("automatic");
    expect(adapterMap.get("opencode")?.authFlowIds).toEqual(
      expect.arrayContaining(["opencode-openai-chatgpt", "opencode-github-copilot", "opencode-gitlab-duo"]),
    );
  });

  it("exposes detect metadata for every adapter", () => {
    for (const adapter of adapters) {
      expect(adapter.detect).toBeDefined();
      expect(Array.isArray(adapter.detect?.commands)).toBe(true);
      expect(Array.isArray(adapter.surfaces)).toBe(true);
    }
  });
});
