import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clineAdapter, cursorAdapter, windsurfAdapter } from "../src/adapters/ide-guided.js";
import { adapterMap } from "../src/adapters/index.js";
import { configRoot } from "../src/core/paths.js";
import { getProvider } from "../src/providers/catalog.js";

const temps: string[] = [];
afterEach(async () => Promise.all(temps.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }))));

async function tempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cpm-ide-guided-"));
  temps.push(dir);
  return dir;
}

function openRouterCtx(home: string) {
  const provider = getProvider("openrouter");
  return {
    home,
    provider,
    models: provider.models,
    selectedModel: provider.defaultModel ?? provider.models[0]!.id,
  };
}

describe("ide-guided adapters", () => {
  it("keeps Cursor/Windsurf/Cline as guided (no credential writers)", () => {
    expect(adapterMap.get("cursor")?.providerInjection).toBe("guided");
    expect(adapterMap.get("windsurf")?.providerInjection).toBe("guided");
    expect(adapterMap.get("cline")?.providerInjection).toBe("guided");
    expect(cursorAdapter.providerInjection).toBe("guided");
    expect(windsurfAdapter.providerInjection).toBe("guided");
    expect(clineAdapter.providerInjection).toBe("guided");
  });

  it("Cursor plan verifies mcp.json and settings paths under a temp home", async () => {
    const home = await tempHome();
    const mcp = path.join(home, ".cursor", "mcp.json");
    const settings = path.join(configRoot(home), "Cursor", "User", "settings.json");
    await fs.mkdir(path.dirname(mcp), { recursive: true });
    await fs.mkdir(path.dirname(settings), { recursive: true });
    await fs.writeFile(mcp, '{"mcpServers":{}}\n');
    await fs.writeFile(settings, "{}\n");

    const plan = await cursorAdapter.plan(openRouterCtx(home));
    expect(plan.status).toBe("manual");
    expect(plan.path).toBe(settings);
    expect(plan.notes.some((note) => note.includes("verified") && note.includes(mcp))).toBe(true);
    expect(plan.notes.some((note) => note.includes("verified") && note.includes(settings))).toBe(true);
    expect(plan.notes.some((note) => note.includes("baseURL=") && note.includes("keyEnv=OPENROUTER_API_KEY"))).toBe(true);
    expect(plan.after).toBeUndefined();
  });

  it("Windsurf plan prefers verified mcp_config.json", async () => {
    const home = await tempHome();
    const mcp = path.join(home, ".codeium", "windsurf", "mcp_config.json");
    await fs.mkdir(path.dirname(mcp), { recursive: true });
    await fs.writeFile(mcp, '{"mcpServers":{}}\n');

    const plan = await windsurfAdapter.plan(openRouterCtx(home));
    expect(plan.status).toBe("manual");
    expect(plan.path).toBe(mcp);
    expect(plan.notes.some((note) => note.includes("verified") && note.includes(mcp))).toBe(true);
    expect(plan.notes.some((note) => note.includes("expected, not present yet") && note.includes("settings.json"))).toBe(true);
  });

  it("Cline plan detects host globalStorage mcp settings", async () => {
    const home = await tempHome();
    const mcp = path.join(
      configRoot(home),
      "Code",
      "User",
      "globalStorage",
      "saoudrizwan.claude-dev",
      "settings",
      "cline_mcp_settings.json",
    );
    await fs.mkdir(path.dirname(mcp), { recursive: true });
    await fs.writeFile(mcp, '{"mcpServers":{}}\n');

    const plan = await clineAdapter.plan(openRouterCtx(home));
    expect(plan.status).toBe("manual");
    expect(plan.path).toBe(mcp);
    expect(plan.notes.some((note) => note.includes("OpenAI Compatible"))).toBe(true);
    expect(plan.notes.some((note) => note.includes("verified") && note.includes(mcp))).toBe(true);
  });

  it("reports expected paths when nothing is installed yet", async () => {
    const home = await tempHome();
    const cursor = await cursorAdapter.plan(openRouterCtx(home));
    expect(cursor.status).toBe("manual");
    expect(cursor.path).toBe(path.join(home, ".cursor", "mcp.json"));
    expect(cursor.notes.some((note) => note.includes("expected, not present yet"))).toBe(true);
  });
});
