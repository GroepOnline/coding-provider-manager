import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { addSecret } from "../src/core/vault.js";
import { planMcpResources, resourceRuntimeEnv } from "../src/resources/apply.js";
import { upsertResource } from "../src/resources/registry.js";

const home = "/tmp/cpm-resource-test";

describe("resource control plane", () => {
  it("renders MCP config with env references and injects resource secrets at runtime", async () => {
    await fs.rm(home, { recursive: true, force: true });
    await addSecret(home, "resource/context7", "primary", "ctx-secret", true);
    await upsertResource(home, {
      id: "context7",
      kind: "mcp",
      enabled: true,
      targets: ["opencode", "kilo"],
      config: { type: "remote", url: "https://mcp.context7.com/mcp", oauth: false },
      secretRefs: { CONTEXT7_API_KEY: { scope: "resource/context7" } },
    });

    const plan = await planMcpResources(home, "opencode");
    expect(plan.after).toContain("https://mcp.context7.com/mcp");
    expect(plan.after).toContain("{env:CONTEXT7_API_KEY}");
    expect(plan.after).not.toContain("ctx-secret");
    expect(await resourceRuntimeEnv(home, "opencode")).toEqual({ CONTEXT7_API_KEY: "ctx-secret" });
  });
});
