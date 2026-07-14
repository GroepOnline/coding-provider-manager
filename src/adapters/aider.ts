import path from "node:path";
import type { ToolAdapter } from "../types.js";
import { readText, updateYaml } from "../core/fs.js";
import { baseUrlFor, modelsForProtocol, unsupportedByPolicy } from "./helpers.js";

export const aiderAdapter: ToolAdapter = {
  id: "aider",
  displayName: "Aider",
  command: "aider",
  async plan(ctx) {
    const policy = unsupportedByPolicy(ctx, "aider");
    if (policy) return { tool: "aider", status: "unsupported", notes: policy };
    const models = modelsForProtocol(ctx, "openai-chat");
    const selected = models.find((item) => item.id === ctx.selectedModel) ?? models[0];
    if (!selected) return { tool: "aider", status: "unsupported", notes: [`${ctx.provider.displayName} has no Chat Completions model for Aider.`] };
    const file = path.join(ctx.home, ".aider.conf.yml");
    const before = await readText(file);
    const after = updateYaml(before, [
      { path: ["model"], value: `openai/${selected.id}` },
      { path: ["openai-api-base"], value: baseUrlFor(ctx, selected) },
      { path: ["show-model-warnings"], value: false },
    ]);
    return {
      tool: "aider",
      status: "ready",
      path: file,
      before,
      after,
      notes: ["Writes endpoint/model only.", `cpm run maps the active ${ctx.provider.keyEnv} slot to Aider/OpenAI environment variables.`],
    };
  },
  runtimeEnv(ctx, key) {
    const models = modelsForProtocol(ctx, "openai-chat");
    const selected = models.find((item) => item.id === ctx.selectedModel) ?? models[0];
    const base = selected ? baseUrlFor(ctx, selected) : ctx.provider.openAIBaseUrl;
    return {
      [ctx.provider.keyEnv]: key,
      OPENAI_API_KEY: key,
      OPENAI_API_BASE: base ?? "",
      AIDER_OPENAI_API_KEY: key,
      AIDER_OPENAI_API_BASE: base ?? "",
      AIDER_MODEL: `openai/${selected?.id ?? ctx.selectedModel}`,
    };
  },
};
