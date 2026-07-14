import path from "node:path";
import type { ToolAdapter } from "../types.js";
import { parseJsoncObject, readText, setJsonc } from "../core/fs.js";
import { baseUrlFor, modelsForProtocol, unsupportedByPolicy } from "./helpers.js";

export const factoryAdapter: ToolAdapter = {
  id: "factory",
  displayName: "Factory Droid",
  command: "droid",
  async plan(ctx) {
    const policy = unsupportedByPolicy(ctx, "factory");
    if (policy) return { tool: "factory", status: "unsupported", notes: policy };
    const models = modelsForProtocol(ctx, "openai-chat");
    if (!models.length) return { tool: "factory", status: "unsupported", notes: [`${ctx.provider.displayName} has no Chat Completions models selected for Factory.`] };
    const file = path.join(ctx.home, ".factory", "settings.json");
    const before = await readText(file);
    const parsed = parseJsoncObject(before);
    const current = Array.isArray(parsed.customModels) ? parsed.customModels as Record<string, unknown>[] : [];
    const marker = `[CPM:${ctx.provider.id}]`;
    const unmanaged = current.filter((item) => !String(item.displayName ?? "").includes(marker));
    const managed = models.map((item) => ({
      model: item.id,
      displayName: `${item.name || item.id} ${marker}`,
      baseUrl: baseUrlFor(ctx, item),
      apiKey: `\${${ctx.provider.keyEnv}}`,
      provider: "generic-chat-completion-api",
      maxOutputTokens: item.output || 32_000,
    }));
    const after = setJsonc(before, ["customModels"], [...unmanaged, ...managed]);
    return {
      tool: "factory",
      status: "ready",
      path: file,
      before,
      after,
      notes: [
        `Adds ${managed.length} Chat Completions model(s) and preserves unrelated Factory models.`,
        `Uses Factory's supported \${${ctx.provider.keyEnv}} reference.`,
      ],
    };
  },
  runtimeEnv(ctx, key) { return { [ctx.provider.keyEnv]: key }; },
};
