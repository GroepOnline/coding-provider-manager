import os from "node:os";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { planMcpResources } from "../src/resources/apply.js";
import { upsertResource } from "../src/resources/registry.js";

const homes: string[] = [];
afterEach(async () => Promise.all(homes.splice(0).map((home) => fs.rm(home, { recursive: true, force: true }))));

async function tempHome(): Promise<string> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-expanded-resource-"));
  homes.push(home);
  return home;
}

describe("expanded MCP renderers", () => {
  it("renders one shared Codex MCP block with env_vars and remote OAuth metadata", async () => {
    const home = await tempHome();
    await upsertResource(home, {
      id: "local-tools",
      kind: "mcp",
      enabled: true,
      targets: ["codex", "codex-app", "codex-ide"],
      config: { type: "local", command: ["npx", "-y", "example-mcp"] },
      secretRefs: { EXAMPLE_TOKEN: { scope: "resource/example" } },
    });
    await upsertResource(home, {
      id: "remote-oauth",
      kind: "mcp",
      enabled: true,
      targets: ["codex"],
      config: { type: "remote", url: "https://example.com/mcp", oauthClientId: "client-1", oauthResource: "https://example.com" },
    });
    const plan = await planMcpResources(home, "codex");
    const appPlan = await planMcpResources(home, "codex-app");
    const idePlan = await planMcpResources(home, "codex-ide");
    expect(appPlan.after).toBe(plan.after);
    expect(idePlan.after).toBe(plan.after);
    expect(plan.after).toContain('[mcp_servers."local-tools"]');
    expect(plan.after).toContain('env_vars = ["EXAMPLE_TOKEN"]');
    expect(plan.after).toContain('oauth_client_id = "client-1"');
    expect(plan.after).not.toContain("resource/example");
  });

  it("renders Gemini and Cursor MCP configuration with environment references", async () => {
    const home = await tempHome();
    await upsertResource(home, {
      id: "remote",
      kind: "mcp",
      enabled: true,
      targets: ["gemini-cli", "cursor"],
      config: { type: "remote", url: "https://example.com/mcp" },
      secretRefs: { AUTH_TOKEN: { scope: "resource/remote" } },
    });
    const gemini = await planMcpResources(home, "gemini-cli");
    const cursor = await planMcpResources(home, "cursor");
    expect(gemini.path).toBe(path.join(home, ".gemini", "settings.json"));
    expect(gemini.after).toContain("$AUTH_TOKEN");
    expect(cursor.path).toBe(path.join(home, ".cursor", "mcp.json"));
    expect(cursor.after).toContain("${AUTH_TOKEN}");
  });
});
