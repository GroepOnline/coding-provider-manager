import path from "node:path";
import type { AdapterContext, PlannedChange, ToolAdapter } from "../types.js";
import { pathExists } from "../core/fs.js";
import { electronAppRoots } from "../core/paths.js";
import { modelBaseUrl, modelProtocol } from "../providers/catalog.js";
import { unsupportedByPolicy } from "./helpers.js";

async function existingPaths(candidates: string[]): Promise<string[]> {
  const found: string[] = [];
  for (const candidate of candidates) {
    if (await pathExists(candidate)) found.push(candidate);
  }
  return found;
}

function providerValues(ctx: AdapterContext): string {
  const selected = ctx.models.find((item) => item.id === ctx.selectedModel) ?? ctx.models[0];
  if (!selected) return "No model is selected.";
  return `Configure ${ctx.provider.displayName}: model=${selected.id}, protocol=${modelProtocol(ctx.provider, selected)}, baseURL=${modelBaseUrl(ctx.provider, selected) ?? "n/a"}, keyEnv=${ctx.provider.keyEnv}.`;
}

function annotatePaths(label: string, candidates: string[], found: string[]): string {
  if (found.length) return `${label} (verified): ${found.join("; ")}`;
  return `${label} (expected, not present yet): ${candidates[0]}`;
}

function clineMcpCandidates(home: string): string[] {
  const hosts = ["Code", "Cursor", "Windsurf", "Code - Insiders"];
  const relative = path.join("User", "globalStorage", "saoudrizwan.claude-dev", "settings", "cline_mcp_settings.json");
  return hosts.flatMap((host) => electronAppRoots(home, host).map((root) => path.join(root, relative)));
}

function cursorSettingsCandidates(home: string): string[] {
  return electronAppRoots(home, "Cursor").map((root) => path.join(root, "User", "settings.json"));
}

function windsurfSettingsCandidates(home: string): string[] {
  return [
    path.join(home, ".codeium", "windsurf", "settings.json"),
    ...electronAppRoots(home, "Windsurf").map((root) => path.join(root, "User", "settings.json")),
  ];
}

export const cursorAdapter: ToolAdapter = {
  id: "cursor",
  displayName: "Cursor",
  command: "cursor",
  surfaces: ["desktop", "ide"],
  providerInjection: "guided",
  detect: {
    commands: ["cursor"],
    paths: [
      "/Applications/Cursor.app",
      "%LOCALAPPDATA%/Programs/cursor/Cursor.exe",
      "%LOCALAPPDATA%/Programs/Cursor/Cursor.exe",
      "%ProgramFiles%/Cursor/Cursor.exe",
    ],
  },
  async plan(ctx): Promise<PlannedChange> {
    const policy = unsupportedByPolicy(ctx, "cursor");
    if (policy) return { tool: "cursor", status: "unsupported", notes: policy };

    const mcpPath = path.join(ctx.home, ".cursor", "mcp.json");
    const settingsCandidates = cursorSettingsCandidates(ctx.home);
    const [mcpFound, settingsFound] = await Promise.all([
      pathExists(mcpPath).then((ok) => (ok ? [mcpPath] : [])),
      existingPaths(settingsCandidates),
    ]);
    const guidancePath = settingsFound[0] ?? mcpFound[0] ?? mcpPath;

    return {
      tool: "cursor",
      status: "manual",
      path: guidancePath,
      notes: [
        "Cursor stores OpenAI/Anthropic API keys and Override OpenAI Base URL in application secure storage / state.vscdb — CPM does not patch those databases.",
        providerValues(ctx),
        "UI: Cursor Settings → Models → set OpenAI API Key (or provider key) and Override OpenAI Base URL to the baseURL above; leave native Anthropic BYOK off when using a single OpenAI-compatible gateway.",
        annotatePaths("MCP config", [mcpPath], mcpFound),
        annotatePaths("User settings.json", settingsCandidates, settingsFound),
        "MCP servers are applied separately via CPM resource writers to ~/.cursor/mcp.json (no provider credentials).",
      ],
    };
  },
};

export const windsurfAdapter: ToolAdapter = {
  id: "windsurf",
  displayName: "Windsurf",
  command: "windsurf",
  surfaces: ["desktop", "ide"],
  providerInjection: "guided",
  detect: {
    commands: ["windsurf"],
    paths: [
      "/Applications/Windsurf.app",
      "%LOCALAPPDATA%/Programs/Windsurf/Windsurf.exe",
      "%ProgramFiles%/Windsurf/Windsurf.exe",
    ],
  },
  async plan(ctx): Promise<PlannedChange> {
    const policy = unsupportedByPolicy(ctx, "windsurf");
    if (policy) return { tool: "windsurf", status: "unsupported", notes: policy };

    const mcpPath = path.join(ctx.home, ".codeium", "windsurf", "mcp_config.json");
    const settingsCandidates = windsurfSettingsCandidates(ctx.home);
    const [mcpFound, settingsFound] = await Promise.all([
      pathExists(mcpPath).then((ok) => (ok ? [mcpPath] : [])),
      existingPaths(settingsCandidates),
    ]);
    const guidancePath = mcpFound[0] ?? settingsFound[0] ?? mcpPath;

    return {
      tool: "windsurf",
      status: "manual",
      path: guidancePath,
      notes: [
        "Windsurf Cascade model access is primarily Codeium-account owned; there is no stable public arbitrary-provider BYOK writer CPM can safely apply.",
        providerValues(ctx),
        "If the build exposes custom/OpenAI-compatible models in Windsurf Settings → Cascade / Models, paste the baseURL, model id, and keyEnv value above — do not copy vault secrets into mcp_config.json.",
        annotatePaths("MCP config", [mcpPath], mcpFound),
        annotatePaths("Windsurf settings", settingsCandidates, settingsFound),
        "MCP servers are applied separately via CPM resource writers to ~/.codeium/windsurf/mcp_config.json.",
      ],
    };
  },
};

export const clineAdapter: ToolAdapter = {
  id: "cline",
  displayName: "Cline",
  surfaces: ["extension", "ide"],
  providerInjection: "guided",
  detect: {
    commands: ["code", "cursor", "windsurf"],
    paths: [],
  },
  async plan(ctx): Promise<PlannedChange> {
    const policy = unsupportedByPolicy(ctx, "cline");
    if (policy) return { tool: "cline", status: "unsupported", notes: policy };

    const mcpCandidates = clineMcpCandidates(ctx.home);
    const clineHome = path.join(ctx.home, ".cline");
    const [mcpFound, homeFound] = await Promise.all([
      existingPaths(mcpCandidates),
      pathExists(clineHome).then((ok) => (ok ? [clineHome] : [])),
    ]);
    const guidancePath = mcpFound[0] ?? homeFound[0] ?? mcpCandidates[0]!;

    return {
      tool: "cline",
      status: "manual",
      path: guidancePath,
      notes: [
        "Cline keeps API keys in the host editor SecretStorage and provider options in extension global state — CPM does not rewrite those stores.",
        providerValues(ctx),
        "UI: Cline Settings → API Provider → OpenAI Compatible → Base URL + model id from the values above; paste the active keyEnv secret when prompted.",
        annotatePaths("cline_mcp_settings.json", mcpCandidates, mcpFound),
        annotatePaths("~/.cline home", [clineHome], homeFound),
        "Host-agnostic detection checks VS Code, Cursor, Windsurf, and Insiders globalStorage layouts under the current home.",
      ],
    };
  },
};
