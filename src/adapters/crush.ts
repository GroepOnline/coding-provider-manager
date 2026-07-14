import path from "node:path";
import type { ToolAdapter } from "../types.js";
import { configRoot } from "../core/paths.js";
import { readText, setJsonc } from "../core/fs.js";
import { baseUrlFor, configId, modelsForProtocol, unsupportedByPolicy } from "./helpers.js";

export const crushAdapter: ToolAdapter = {
  id: "crush",
  displayName: "Crush",
  command: "crush",
  async plan(ctx) {
    const policy = unsupportedByPolicy(ctx, "crush");
    if (policy) return { tool: "crush", status: "unsupported", notes: policy };
    const models = modelsForProtocol(ctx, "openai-chat");
    if (!models.length) return { tool: "crush", status: "unsupported", notes: [`${ctx.provider.displayName} has no Chat Completions models selected for Crush.`] };
    const file = path.join(configRoot(ctx.home), "crush", "crush.json");
    const before = await readText(file);
    const first = models[0]!;
    let after = setJsonc(before, ["$schema"], "https://charm.land/crush.json");
    after = setJsonc(after, ["providers", configId(ctx, "openai-chat")], {
      name: ctx.provider.displayName,
      type: "openai-compat",
      base_url: baseUrlFor(ctx, first),
      api_key: `\${${ctx.provider.keyEnv}:?set ${ctx.provider.keyEnv}}`,
      models: models.map((item) => ({
        id: item.id,
        name: item.name || item.id,
        context_window: item.context || 200_000,
        default_max_tokens: item.output || 32_000,
        can_reason: item.reasoning ?? false,
      })),
    });
    return {
      tool: "crush",
      status: "ready",
      path: file,
      before,
      after,
      notes: [
        "Uses Crush's openai-compat provider contract.",
        `Uses required shell expansion \${${ctx.provider.keyEnv}:?set ${ctx.provider.keyEnv}}.`,
      ],
    };
  },
  runtimeEnv(ctx, key) { return { [ctx.provider.keyEnv]: key }; },
};
