import path from "node:path";
import type { ToolAdapter } from "../types.js";
import { readText, setJsonc } from "../core/fs.js";
import { modelsForProtocol, unsupportedByPolicy } from "./helpers.js";

export const claudeAdapter: ToolAdapter = {
  id: "claude",
  displayName: "Claude Code",
  command: "claude",
  async plan(ctx) {
    const policy = unsupportedByPolicy(ctx, "claude");
    if (policy) return { tool: "claude", status: "unsupported", notes: policy };
    if (!ctx.provider.anthropicBaseUrl) {
      return { tool: "claude", status: "unsupported", notes: [`${ctx.provider.displayName} has no Anthropic Messages endpoint.`] };
    }
    const explicitAnthropic = modelsForProtocol(ctx, "anthropic-messages");
    const candidates = explicitAnthropic.length ? explicitAnthropic : ctx.models;
    const selected = candidates.find((item) => item.id === ctx.selectedModel) ?? candidates[0];
    if (!selected) return { tool: "claude", status: "unsupported", notes: ["No Claude-compatible models selected."] };

    const file = path.join(ctx.home, ".claude", "settings.json");
    const before = await readText(file);
    const mapped = ctx.provider.claude?.modelAliases?.[selected.id] ?? selected.id;
    const small = ctx.provider.claude?.smallModel ?? mapped;
    const env: Record<string, string> = {
      ANTHROPIC_BASE_URL: ctx.provider.anthropicBaseUrl,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: small,
      ANTHROPIC_DEFAULT_SONNET_MODEL: mapped,
      ANTHROPIC_DEFAULT_OPUS_MODEL: mapped,
      ...(ctx.provider.claude?.extraEnv ?? {}),
    };
    let after = before;
    for (const [key, value] of Object.entries(env)) after = setJsonc(after, ["env", key], value);
    return {
      tool: "claude",
      status: "ready",
      path: file,
      before,
      after,
      notes: [
        `Routes Claude Code to ${ctx.provider.displayName}'s Anthropic endpoint.`,
        `The active ${ctx.provider.keyEnv} slot is exposed only as ANTHROPIC_AUTH_TOKEN by cpm run.`,
      ],
    };
  },
  runtimeEnv(ctx, key) {
    const explicitAnthropic = modelsForProtocol(ctx, "anthropic-messages");
    const candidates = explicitAnthropic.length ? explicitAnthropic : ctx.models;
    const selected = candidates.find((item) => item.id === ctx.selectedModel) ?? candidates[0];
    const mapped = selected ? ctx.provider.claude?.modelAliases?.[selected.id] ?? selected.id : ctx.selectedModel;
    return {
      [ctx.provider.keyEnv]: key,
      ANTHROPIC_AUTH_TOKEN: key,
      ANTHROPIC_API_KEY: key,
      ANTHROPIC_BASE_URL: ctx.provider.anthropicBaseUrl ?? "",
      ANTHROPIC_DEFAULT_SONNET_MODEL: mapped,
      ANTHROPIC_DEFAULT_OPUS_MODEL: mapped,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: ctx.provider.claude?.smallModel ?? mapped,
      ...(ctx.provider.claude?.extraEnv ?? {}),
    };
  },
};
