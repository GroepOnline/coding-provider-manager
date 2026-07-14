import path from "node:path";
import type { AdapterContext, ToolAdapter, ToolId, ToolSurface } from "../types.js";
import { readText } from "../core/fs.js";
import { baseUrlFor, configId, modelsForProtocol, unsupportedByPolicy } from "./helpers.js";

function quoteToml(value: string): string {
  return JSON.stringify(value);
}

function replaceManagedBlock(text: string, id: string, block: string): string {
  const start = `# >>> CPM ${id}`;
  const end = `# <<< CPM ${id}`;
  const expression = new RegExp(`${start.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${end.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\n?`, "m");
  const clean = text.replace(expression, "").trimEnd();
  return `${clean}${clean ? "\n\n" : ""}${start}\n${block.trim()}\n${end}\n`;
}

function setTopLevelToml(text: string, key: string, value: string): string {
  const lines = text.split(/\r?\n/);
  const firstTable = lines.findIndex((line) => /^\s*\[/.test(line));
  const limit = firstTable < 0 ? lines.length : firstTable;
  const index = lines.slice(0, limit).findIndex((line) => new RegExp(`^\\s*${key}\\s*=`).test(line));
  const entry = `${key} = ${quoteToml(value)}`;
  if (index >= 0) lines[index] = entry;
  else lines.splice(limit, 0, entry);
  return lines.join("\n");
}

async function planCodex(ctx: AdapterContext, tool: ToolId, displayName: string) {
  const policy = unsupportedByPolicy(ctx, tool);
  if (policy) return { tool, status: "unsupported" as const, notes: policy };
  const models = modelsForProtocol(ctx, "openai-responses");
  const selected = models.find((item) => item.id === ctx.selectedModel) ?? models[0];
  if (!selected) {
    return {
      tool,
      status: "unsupported" as const,
      notes: [`${ctx.provider.displayName} exposes no selected OpenAI Responses model. The Codex provider contract does not accept Chat Completions.`],
    };
  }

  const file = path.join(ctx.home, ".codex", "config.toml");
  const before = await readText(file);
  let after = before;
  const notes: string[] = [];

  if (ctx.provider.id === "openai") {
    if (ctx.makeDefault) {
      after = setTopLevelToml(after, "model_provider", "openai");
      after = setTopLevelToml(after, "model", selected.id);
    }
    notes.push("Uses Codex's built-in OpenAI provider and its own ChatGPT/API-key credential store; CPM does not copy OAuth tokens.");
  } else {
    const providerId = configId(ctx, "openai-responses");
    const block = [
      `[model_providers.${providerId}]`,
      `name = ${quoteToml(ctx.provider.displayName)}`,
      `base_url = ${quoteToml(baseUrlFor(ctx, selected) ?? "")}`,
      `env_key = ${quoteToml(ctx.provider.keyEnv)}`,
      `wire_api = "responses"`,
      `requires_openai_auth = false`,
    ].join("\n");
    after = replaceManagedBlock(after, ctx.provider.id, block);
    if (ctx.makeDefault) {
      after = setTopLevelToml(after, "model_provider", providerId);
      after = setTopLevelToml(after, "model", selected.id);
    }
    notes.push("Adds only a Responses-compatible provider block and references the provider key through env_key.");
  }

  notes.push(`${displayName} shares the local Codex host configuration at ~/.codex/config.toml.`);
  notes.push(ctx.makeDefault ? `Sets ${selected.id} as the Codex default.` : "Preserves the current Codex default; use --make-default to switch it.");
  if (tool !== "codex") notes.push("GUI/IDE launches may not inherit shell-only variables; use OS-level environment injection or Codex-owned OpenAI login where applicable.");

  return { tool, status: "ready" as const, path: file, before, after, notes };
}

function createCodexAdapter(
  id: "codex" | "codex-app" | "codex-ide",
  displayName: string,
  surfaces: ToolSurface[],
  command?: string,
): ToolAdapter {
  return {
    id,
    displayName,
    command,
    surfaces,
    sharedConfigGroup: "codex-local-host",
    providerInjection: "automatic",
    authFlowIds: ["codex-chatgpt", "codex-openai-key", "codex-access-token"],
    detect: {
      commands: command ? [command] : id === "codex-ide" ? ["code", "cursor", "windsurf"] : [],
      paths: id === "codex-app"
        ? ["/Applications/ChatGPT.app", "~/AppData/Local/Programs/ChatGPT/ChatGPT.exe", "~/.local/share/applications/chatgpt.desktop"]
        : [],
    },
    plan: (ctx) => planCodex(ctx, id, displayName),
    ...(command ? { runtimeEnv: (ctx: AdapterContext, key: string) => ({ [ctx.provider.keyEnv]: key }) } : {}),
  };
}

export const codexAdapter = createCodexAdapter("codex", "OpenAI Codex CLI", ["cli"], "codex");
export const codexAppAdapter = createCodexAdapter("codex-app", "Codex desktop app (ChatGPT local host)", ["desktop"]);
export const codexIdeAdapter = createCodexAdapter("codex-ide", "Codex IDE extension", ["ide", "extension"]);
