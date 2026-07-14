import path from "node:path";
import type { ModelInfo, ProviderProtocol, ToolAdapter } from "../types.js";
import { parseJsoncObject, readText, setJsonc } from "../core/fs.js";
import { baseUrlFor, protocolGroups, unsupportedByPolicy } from "./helpers.js";

function qwenProtocol(protocol: ProviderProtocol): "openai" | "anthropic" | undefined {
  if (protocol === "openai-chat") return "openai";
  if (protocol === "anthropic-messages") return "anthropic";
  return undefined;
}

function existingEntries(root: Record<string, unknown>, protocol: string): Record<string, unknown>[] {
  const providers = root.modelProviders;
  if (!providers || typeof providers !== "object" || Array.isArray(providers)) return [];
  const entries = (providers as Record<string, unknown>)[protocol];
  return Array.isArray(entries)
    ? entries.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item))
    : [];
}

function mergeModels(existing: Record<string, unknown>[], incoming: Record<string, unknown>[]): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const item of existing) if (typeof item.id === "string") byId.set(item.id, item);
  for (const item of incoming) byId.set(String(item.id), item);
  return [...byId.values()];
}

function entryFor(model: ModelInfo, baseUrl: string | undefined, envKey: string): Record<string, unknown> {
  return {
    id: model.id,
    name: model.name ?? model.id,
    ...(baseUrl ? { baseUrl } : {}),
    envKey,
    description: `${model.name ?? model.id} via CPM`,
  };
}

export const qwenCodeAdapter: ToolAdapter = {
  id: "qwen-code",
  displayName: "Qwen Code",
  command: "qwen",
  surfaces: ["cli", "ide"],
  providerInjection: "automatic",
  authFlowIds: ["qwen-auth-menu"],
  detect: { commands: ["qwen"] },
  async plan(ctx) {
    const policy = unsupportedByPolicy(ctx, "qwen-code");
    if (policy) return { tool: "qwen-code", status: "unsupported", notes: policy };
    const supportedGroups = protocolGroups(ctx).filter(([protocol]) => qwenProtocol(protocol));
    if (!supportedGroups.length) {
      return {
        tool: "qwen-code",
        status: "unsupported",
        notes: ["Qwen Code supports OpenAI Chat Completions and Anthropic Messages custom providers, but the selected models only expose Responses."],
      };
    }

    const file = path.join(ctx.home, ".qwen", "settings.json");
    const before = await readText(file);
    const parsed = parseJsoncObject(before);
    let after = before;
    const emitted = new Set<string>();

    for (const [protocol, models] of supportedGroups) {
      const target = qwenProtocol(protocol)!;
      const incoming = models.map((model) => entryFor(model, baseUrlFor(ctx, model), ctx.provider.keyEnv));
      after = setJsonc(after, ["modelProviders", target], mergeModels(existingEntries(parsed, target), incoming));
      emitted.add(target);
    }

    const selected = ctx.models.find((item) => item.id === ctx.selectedModel);
    const selectedProtocol = selected ? qwenProtocol(selected.protocol ?? ctx.provider.protocol) : undefined;
    if (ctx.makeDefault && selected && selectedProtocol) {
      after = setJsonc(after, ["security", "auth", "selectedType"], selectedProtocol);
      after = setJsonc(after, ["model", "name"], selected.id);
    }

    return {
      tool: "qwen-code",
      status: "ready",
      path: file,
      before,
      after,
      notes: [
        `Adds ${[...emitted].join(" and ")} provider entries to Qwen Code without writing a plaintext key into settings.json.`,
        "Qwen Code resolves each model's envKey from the process environment or its own .env search path.",
        ctx.makeDefault && selectedProtocol ? `Sets ${ctx.selectedModel} as the Qwen Code default.` : "Preserves Qwen Code's current default model.",
      ],
    };
  },
  runtimeEnv(ctx, key) { return { [ctx.provider.keyEnv]: key }; },
};
