import path from "node:path";
import YAML from "yaml";
import type { ToolAdapter } from "../types.js";
import { readText, updateYaml } from "../core/fs.js";
import { baseUrlFor, modelsForProtocol, unsupportedByPolicy } from "./helpers.js";

export const continueAdapter: ToolAdapter = {
  id: "continue",
  displayName: "Continue",
  async plan(ctx) {
    const policy = unsupportedByPolicy(ctx, "continue");
    if (policy) return { tool: "continue", status: "unsupported", notes: policy };
    const models = modelsForProtocol(ctx, "openai-chat");
    if (!models.length) return { tool: "continue", status: "unsupported", notes: [`${ctx.provider.displayName} has no Chat Completions models for Continue.`] };
    const file = path.join(ctx.home, ".continue", "config.yaml");
    const before = await readText(file);
    const parsed = (YAML.parse(before || "{}") || {}) as Record<string, unknown>;
    const currentModels = Array.isArray(parsed.models)
      ? parsed.models.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
      : [];
    const suffix = ctx.provider.id === "zai-coding" ? "(Z.AI Coding)" : `(CPM:${ctx.provider.id})`;
    const unmanaged = currentModels.filter((item) => !String(item.name ?? "").endsWith(suffix));
    const managed = models.map((item) => ({
      name: `${item.name || item.id} ${suffix}`,
      provider: "openai",
      model: item.id,
      apiBase: baseUrlFor(ctx, item),
      apiKey: `\${{ secrets.${ctx.provider.keyEnv} }}`,
      useResponsesApi: false,
      roles: ["chat", "edit", "apply"],
      capabilities: item.toolCall === false ? [] : ["tool_use"],
      defaultCompletionOptions: { maxTokens: item.output || 32_000 },
    }));
    const after = updateYaml(before, [
      { path: ["name"], value: typeof parsed.name === "string" ? parsed.name : "Local coding providers" },
      { path: ["version"], value: typeof parsed.version === "string" ? parsed.version : "1.0.0" },
      { path: ["schema"], value: typeof parsed.schema === "string" ? parsed.schema : "v1" },
      { path: ["models"], value: [...unmanaged, ...managed] },
    ]);
    return {
      tool: "continue",
      status: "ready",
      path: file,
      before,
      after,
      notes: [
        "Preserves unrelated Continue model entries.",
        `References Continue secret ${ctx.provider.keyEnv}; CPM does not copy a literal key into YAML.`,
      ],
    };
  },
};
