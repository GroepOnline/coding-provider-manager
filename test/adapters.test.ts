import { describe, expect, it } from "vitest";
import { factoryAdapter } from "../src/adapters/factory.js";
import { kiloAdapter } from "../src/adapters/kilo.js";
import { continueAdapter } from "../src/adapters/continue.js";
import { crushAdapter } from "../src/adapters/crush.js";
import { zaiCodingProfile } from "../src/providers/zai.js";

const ctx = { home: "/tmp/cpm-test-home", provider: zaiCodingProfile, models: zaiCodingProfile.models, selectedModel: "glm-5.2" };

describe("safe adapters", () => {
  it("Factory emits an environment reference", async () => {
    const plan = await factoryAdapter.plan(ctx);
    expect(plan.after).toContain("${ZAI_API_KEY}");
    expect(plan.after).not.toContain("sk-");
  });

  it("Kilo uses trusted global env references and explicit limits", async () => {
    const plan = await kiloAdapter.plan(ctx);
    expect(plan.after).toContain("{env:ZAI_API_KEY}");
    expect(plan.after).toContain('"context": 1000000');
  });

  it("Continue preserves unrelated models and emits readable YAML", async () => {
    const fs = await import("node:fs/promises");
    await fs.mkdir("/tmp/cpm-test-home/.continue", { recursive: true });
    await fs.writeFile("/tmp/cpm-test-home/.continue/config.yaml", "name: Existing\nversion: 1.0.0\nschema: v1\nmodels:\n  - name: Existing Model\n    provider: openai\n    model: existing\n");
    const plan = await continueAdapter.plan({ ...ctx, provider: { ...zaiCodingProfile, allowedTools: [...(zaiCodingProfile.allowedTools || []), "continue"] } });
    expect(plan.after).toContain("Existing Model");
    expect(plan.after).toContain("GLM-5.2 (Z.AI Coding)");
    expect(plan.after).toContain("\nmodels:\n  - name:");
    expect(plan.after).toContain("${{ secrets.ZAI_API_KEY }}");
  });

  it("Crush uses required environment expansion and explicit model limits", async () => {
    const plan = await crushAdapter.plan(ctx);
    expect(plan.after).toContain("${ZAI_API_KEY:?set ZAI_API_KEY}");
    expect(plan.after).toContain('"type": "openai-compat"');
    expect(plan.after).toContain('"context_window": 1000000');
  });

  it("blocks unlisted Coding Plan clients", async () => {
    const plan = await continueAdapter.plan(ctx);
    expect(plan.status).toBe("unsupported");
  });
});
