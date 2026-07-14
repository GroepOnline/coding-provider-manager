import type { ToolAdapter, ToolId, ToolSurface } from "../types.js";
import { modelBaseUrl, modelProtocol } from "../providers/catalog.js";
import { unsupportedByPolicy } from "./helpers.js";

interface GuidedOptions {
  command?: string;
  commands?: string[];
  paths?: string[];
  surfaces?: ToolSurface[];
  providerInjection?: "guided" | "none";
  authFlowIds?: string[];
  reason?: string;
}

function guided(id: ToolId, displayName: string, options: GuidedOptions = {}): ToolAdapter {
  const providerInjection = options.providerInjection ?? "guided";
  return {
    id,
    displayName,
    command: options.command,
    surfaces: options.surfaces,
    providerInjection,
    authFlowIds: options.authFlowIds,
    detect: { commands: options.commands ?? (options.command ? [options.command] : []), paths: options.paths },
    async plan(ctx) {
      const policy = unsupportedByPolicy(ctx, id);
      if (policy) return { tool: id, status: "unsupported", notes: policy };
      if (providerInjection === "none") {
        return {
          tool: id,
          status: "unsupported",
          notes: [
            options.reason ?? `${displayName} has no stable, documented arbitrary-provider injection contract that CPM can safely write.`,
            "The app remains available in CPM for detection, OAuth/account guidance, MCP/resources and future adapters.",
          ],
        };
      }
      const selected = ctx.models.find((item) => item.id === ctx.selectedModel) ?? ctx.models[0];
      return {
        tool: id,
        status: "manual",
        notes: [
          options.reason ?? `${displayName} stores provider credentials in application/extension secure storage, which CPM deliberately does not patch.`,
          selected ? `Configure ${ctx.provider.displayName}: model=${selected.id}, protocol=${modelProtocol(ctx.provider, selected)}, baseURL=${modelBaseUrl(ctx.provider, selected) ?? "n/a"}.` : "No model is selected.",
          `Use the active ${ctx.provider.keyEnv} key slot when the application asks for a key.`,
        ],
      };
    },
  };
}

export const clineAdapter = guided("cline", "Cline", { commands: ["code", "cursor", "windsurf"], surfaces: ["extension", "ide"] });
export const rooAdapter = guided("roo", "Roo Code", { commands: ["code", "cursor", "windsurf"], surfaces: ["extension", "ide"] });
export const cursorAdapter = guided("cursor", "Cursor", {
  command: "cursor",
  paths: [
    "/Applications/Cursor.app",
    "%LOCALAPPDATA%/Programs/cursor/Cursor.exe",
    "%LOCALAPPDATA%/Programs/Cursor/Cursor.exe",
    "%ProgramFiles%/Cursor/Cursor.exe",
  ],
  surfaces: ["desktop", "ide"],
  reason: "Cursor keeps API credentials in application secure storage. CPM only prepares the provider values and MCP config; it does not patch Cursor's databases.",
});
export const t3ChatAdapter = guided("t3-chat", "T3 Chat", {
  surfaces: ["web", "desktop"],
  providerInjection: "none",
  reason: "No stable public T3 Chat BYOK/provider configuration contract was found, so CPM does not automate its private application state.",
});
export const antigravityAdapter = guided("antigravity", "Google Antigravity", {
  commands: ["antigravity"],
  paths: [
    "/Applications/Antigravity.app",
    "%LOCALAPPDATA%/Programs/Antigravity/Antigravity.exe",
    "%ProgramFiles%/Antigravity/Antigravity.exe",
  ],
  surfaces: ["desktop", "ide"],
  providerInjection: "none",
  reason: "Antigravity is treated as a Google-account coding surface; CPM has no verified arbitrary-provider BYOK contract for it.",
});
export const windsurfAdapter = guided("windsurf", "Windsurf", {
  command: "windsurf",
  paths: [
    "/Applications/Windsurf.app",
    "%LOCALAPPDATA%/Programs/Windsurf/Windsurf.exe",
    "%ProgramFiles%/Windsurf/Windsurf.exe",
  ],
  surfaces: ["desktop", "ide"],
});
export const vscodeAdapter = guided("vscode", "Visual Studio Code", {
  command: "code",
  paths: [
    "/Applications/Visual Studio Code.app",
    "%LOCALAPPDATA%/Programs/Microsoft VS Code/Code.exe",
    "%ProgramFiles%/Microsoft VS Code/Code.exe",
    "%ProgramFiles(x86)%/Microsoft VS Code/Code.exe",
  ],
  surfaces: ["desktop", "ide"],
  providerInjection: "none",
  reason: "VS Code itself is a host. Provider injection belongs to the selected extension; CPM manages those extension-specific adapters separately.",
});
export const githubCopilotAdapter = guided("github-copilot", "GitHub Copilot", {
  commands: ["gh", "code"],
  surfaces: ["extension", "ide"],
  providerInjection: "none",
  authFlowIds: ["github-cli", "opencode-github-copilot"],
  reason: "GitHub Copilot uses GitHub account entitlements rather than arbitrary third-party API providers.",
});
export const geminiCliAdapter = guided("gemini-cli", "Gemini CLI", {
  command: "gemini",
  surfaces: ["cli"],
  providerInjection: "none",
  authFlowIds: ["gemini-google", "gemini-vertex-adc"],
  reason: "Gemini CLI supports Google account, Gemini API key and Vertex AI authentication, not arbitrary OpenAI-compatible provider injection.",
});
export const kimiCliAdapter = guided("kimi-cli", "Kimi CLI", { command: "kimi", surfaces: ["cli"] });
export const ampAdapter = guided("amp", "Amp", { command: "amp", surfaces: ["cli", "ide"], providerInjection: "none" });
export const gooseAdapter = guided("goose", "Goose", { command: "goose", surfaces: ["cli", "desktop"] });
export const zedAdapter = guided("zed", "Zed", { command: "zed", paths: ["/Applications/Zed.app"], surfaces: ["desktop", "ide"] });
export const augmentAdapter = guided("augment", "Augment Code", { commands: ["code", "cursor", "idea"], surfaces: ["extension", "ide"], providerInjection: "none" });
export const junieAdapter = guided("junie", "JetBrains Junie", { commands: ["idea"], surfaces: ["ide"], providerInjection: "none" });
export const traeAdapter = guided("trae", "TRAE", { command: "trae", surfaces: ["desktop", "ide"] });
export const sourcegraphCodyAdapter = guided("sourcegraph-cody", "Sourcegraph Cody", { commands: ["code", "cursor"], surfaces: ["extension", "ide"] });
export const replitAgentAdapter = guided("replit-agent", "Replit Agent", { surfaces: ["web"], providerInjection: "none" });

export const copilotCliAdapter = guided("copilot-cli", "GitHub Copilot CLI", {
  command: "copilot",
  commands: ["copilot", "gh"],
  surfaces: ["cli"],
  providerInjection: "none",
  authFlowIds: ["github-cli"],
  reason: "GitHub Copilot CLI uses GitHub account entitlements. CPM manages account selection through the GitHub CLI account driver.",
});
export const amazonQAdapter = guided("amazon-q", "Amazon Q Developer CLI", { command: "q", surfaces: ["cli", "ide"], providerInjection: "none" });
export const kiroAdapter = guided("kiro", "Kiro", { command: "kiro", paths: ["/Applications/Kiro.app"], surfaces: ["desktop", "ide"], providerInjection: "none" });
export const warpAdapter = guided("warp", "Warp", { command: "warp", paths: ["/Applications/Warp.app"], surfaces: ["desktop", "cli"], providerInjection: "none" });
export const openHandsAdapter = guided("openhands", "OpenHands", { command: "openhands", commands: ["openhands", "openhands-cli"], surfaces: ["cli", "web"] });
export const plandexAdapter = guided("plandex", "Plandex", { command: "plandex", surfaces: ["cli"] });
export const mentatAdapter = guided("mentat", "Mentat", { command: "mentat", surfaces: ["cli"] });
export const openInterpreterAdapter = guided("open-interpreter", "Open Interpreter", { command: "interpreter", surfaces: ["cli"] });
export const mistralVibeAdapter = guided("mistral-vibe", "Mistral Vibe", { command: "vibe", surfaces: ["cli"] });
export const tabbyAdapter = guided("tabby", "Tabby", { command: "tabby", surfaces: ["cli", "extension", "ide"] });
export const voidEditorAdapter = guided("void-editor", "Void Editor", { command: "void", paths: ["/Applications/Void.app"], surfaces: ["desktop", "ide"] });
export const pearAiAdapter = guided("pearai", "PearAI", { command: "pearai", paths: ["/Applications/PearAI.app"], surfaces: ["desktop", "ide"] });
export const devinAdapter = guided("devin", "Devin", { command: "devin", surfaces: ["cli", "web"], providerInjection: "none" });
export const sweepAdapter = guided("sweep", "Sweep", { command: "sweep", surfaces: ["cli", "web"], providerInjection: "none" });
export const qodoAdapter = guided("qodo", "Qodo", { commands: ["qodo", "pr-agent"], surfaces: ["cli", "extension", "ide"] });
export const continueCliAdapter = guided("continue-cli", "Continue CLI", { command: "cn", commands: ["cn", "continue"], surfaces: ["cli"] });
export const aiderDeskAdapter = guided("aider-desk", "AiderDesk", { command: "aider-desk", paths: ["/Applications/AiderDesk.app"], surfaces: ["desktop"] });
export const boltAdapter = guided("bolt", "Bolt", { surfaces: ["web"], providerInjection: "none" });
export const lovableAdapter = guided("lovable", "Lovable", { surfaces: ["web"], providerInjection: "none" });
