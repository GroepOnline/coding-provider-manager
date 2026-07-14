import path from "node:path";
import type { ToolAdapter } from "../types.js";
import { readText, setJsonc } from "../core/fs.js";
import { unsupportedByPolicy } from "./helpers.js";

export const piAdapter: ToolAdapter = {
  id: "pi",
  displayName: "Pi + OnlineChefGroep pi-zai",
  command: "pi",
  async plan(ctx) {
    const policy = unsupportedByPolicy(ctx, "pi");
    if (policy) return { tool: "pi", status: "unsupported", notes: policy };
    if (ctx.provider.id !== "zai-coding") {
      return { tool: "pi", status: "unsupported", notes: ["The managed Pi extension profile currently targets OnlineChefGroep/pi-zai and Z.AI only."] };
    }
    const agentDir = process.env.PI_AGENT_DIR || path.join(ctx.home, ".pi", "agent");
    const file = path.join(agentDir, "settings.json");
    const before = await readText(file);
    let after = before;
    after = setJsonc(after, ["zai", "preserveThinking"], false);
    after = setJsonc(after, ["zai", "statusTps"], true);
    after = setJsonc(after, ["zai", "statusTpsAvg"], false);
    after = setJsonc(after, ["zai", "promptStability", "mode"], "observe");
    after = setJsonc(after, ["zai", "sessionAffinity"], "off");
    after = setJsonc(after, ["zai", "metrics", "mode"], "local");
    after = setJsonc(after, ["zai", "metrics", "retentionDays"], 30);
    after = setJsonc(after, ["zai", "metrics", "rollupRetentionDays"], 180);
    after = setJsonc(after, ["zai", "metrics", "maxDatabaseBytes"], 32 * 1024 * 1024);
    after = setJsonc(after, ["zai", "telemetry", "mode"], "off");
    return {
      tool: "pi",
      status: "ready",
      path: file,
      before,
      after,
      notes: [
        "Applies pi-zai's privacy-first defaults and local metrics configuration.",
        "Install the extension once with: pi install npm:@onlinechefgroep/pi-zai",
        "GLM-5.2 off/high/max mapping and clear_thinking behavior stay owned by pi-zai, not duplicated in CPM runtime code.",
      ],
    };
  },
  runtimeEnv(ctx, key) { return { [ctx.provider.keyEnv]: key }; },
};
