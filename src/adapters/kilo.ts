import path from "node:path";
import type { ProviderProtocol, ToolAdapter } from "../types.js";
import { configRoot } from "../core/paths.js";
import { readText, setJsonc } from "../core/fs.js";
import { baseUrlFor, configId, protocolGroups, unsupportedByPolicy } from "./helpers.js";
import { modelProtocol } from "../providers/catalog.js";

function packageFor(protocol: ProviderProtocol): string {
  if (protocol === "anthropic-messages") return "@ai-sdk/anthropic";
  if (protocol === "openai-responses") return "@ai-sdk/openai";
  return "@ai-sdk/openai-compatible";
}

export const kiloAdapter: ToolAdapter = {
  id: "kilo",
  displayName: "Kilo Code / Kilo CLI",
  command: "kilo",
  async plan(ctx) {
    const policy = unsupportedByPolicy(ctx, "kilo");
    if (policy) return { tool: "kilo", status: "unsupported", notes: policy };
    const file = path.join(configRoot(ctx.home), "kilo", "kilo.jsonc");
    const before = await readText(file);
    let after = setJsonc(before, ["$schema"], "https://app.kilo.ai/config.json");
    for (const [protocol, items] of protocolGroups(ctx)) {
      const first = items[0]!;
      const baseURL = baseUrlFor(ctx, first);
      if (!baseURL) continue;
      const models = Object.fromEntries(items.map((item) => [item.id, {
        name: item.name || item.id,
        tool_call: item.toolCall ?? true,
        reasoning: item.reasoning ?? false,
        limit: { context: item.context || 200_000, output: item.output || 32_000 },
      }]));
      after = setJsonc(after, ["provider", configId(ctx, protocol)], {
        npm: packageFor(protocol),
        name: `${ctx.provider.displayName} (${protocol})`,
        options: { baseURL, apiKey: `{env:${ctx.provider.keyEnv}}`, ...(ctx.provider.headers ? { headers: ctx.provider.headers } : {}) },
        models,
      });
    }
    const selected = ctx.models.find((item) => item.id === ctx.selectedModel) ?? ctx.models[0];
    if (ctx.makeDefault && selected) after = setJsonc(after, ["model"], `${configId(ctx, modelProtocol(ctx.provider, selected))}/${selected.id}`);
    return {
      tool: "kilo",
      status: "ready",
      path: file,
      before,
      after,
      notes: [
        "Writes trusted global provider definitions with explicit context/output limits.",
        `Secrets remain {env:${ctx.provider.keyEnv}} references.`,
      ],
    };
  },
  runtimeEnv(ctx, key) { return { [ctx.provider.keyEnv]: key }; },
};
