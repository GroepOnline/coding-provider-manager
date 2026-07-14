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

export const opencodeAdapter: ToolAdapter = {
  id: "opencode",
  displayName: "OpenCode",
  command: "opencode",
  async plan(ctx) {
    const policy = unsupportedByPolicy(ctx, "opencode");
    if (policy) return { tool: "opencode", status: "unsupported", notes: policy };
    const file = path.join(configRoot(ctx.home), "opencode", "opencode.json");
    const before = await readText(file);
    let after = setJsonc(before, ["$schema"], "https://opencode.ai/config.json");

    if (ctx.provider.id === "openai") {
      const selected = ctx.models.find((item) => item.id === ctx.selectedModel) ?? ctx.models[0];
      if (ctx.makeDefault && selected) after = setJsonc(after, ["model"], `openai/${selected.id}`);
      return {
        tool: "opencode",
        status: "ready",
        path: file,
        before,
        after,
        notes: [
          "Uses OpenCode's built-in OpenAI provider so browser OAuth and API-key login remain owned by OpenCode.",
          ctx.makeDefault && selected ? `Sets ${selected.id} as OpenCode default.` : "Preserves the existing OpenCode default model.",
        ],
      };
    }

    for (const [protocol, items] of protocolGroups(ctx)) {
      const first = items[0]!;
      const baseURL = baseUrlFor(ctx, first);
      if (!baseURL) continue;
      const models = Object.fromEntries(items.map((item) => [item.id, {
        name: item.name || item.id,
        ...(item.context || item.output ? { limit: { context: item.context || 200_000, output: item.output || 32_000 } } : {}),
        ...(item.reasoning !== undefined ? { reasoning: item.reasoning } : {}),
        ...(item.toolCall !== undefined ? { tool_call: item.toolCall } : {}),
      }]));
      after = setJsonc(after, ["provider", configId(ctx, protocol)], {
        npm: packageFor(protocol),
        name: `${ctx.provider.displayName} (${protocol})`,
        options: {
          baseURL,
          apiKey: `{env:${ctx.provider.keyEnv}}`,
          ...(ctx.provider.headers ? { headers: ctx.provider.headers } : {}),
        },
        models,
      });
    }

    const selected = ctx.models.find((item) => item.id === ctx.selectedModel) ?? ctx.models[0];
    if (ctx.makeDefault && selected) {
      after = setJsonc(after, ["model"], `${configId(ctx, modelProtocol(ctx.provider, selected))}/${selected.id}`);
    }
    return {
      tool: "opencode",
      status: "ready",
      path: file,
      before,
      after,
      notes: [
        "Creates separate provider entries for Chat Completions, Responses, and Anthropic models when required.",
        `All entries reference {env:${ctx.provider.keyEnv}}; no key is serialized.`,
        ctx.makeDefault ? `Sets ${ctx.selectedModel} as OpenCode default.` : "Preserves the existing OpenCode default model.",
      ],
    };
  },
  runtimeEnv(ctx, key) { return { [ctx.provider.keyEnv]: key }; },
};
